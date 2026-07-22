import { promises as fs } from 'node:fs';
import path from 'node:path';
import { carregarEnv } from './carregarEnv';
import { carregarConfig } from '../config/default';
import { criarAuth } from '../src/integrations/google/auth';
import { DriveClient } from '../src/integrations/drive/driveClient';
import { XlsxSheetsGateway } from '../src/integrations/sheets/xlsxSheets';

/**
 * Teste de ESCRITA na planilha real (`pnpm escrita:test`).
 *
 * Faz backup em disco ANTES de qualquer gravação (reversível com
 * `pnpm restaurar`), grava a estrutura nova (Clientes + GrupoFamiliar,
 * com CEP), lê de volta e confere.
 *
 * Service account não tem cota de armazenamento, então não dá para copiar a
 * planilha no Drive — daí o backup local.
 */
async function main(): Promise<void> {
  carregarEnv();

  const config = carregarConfig();
  const auth = criarAuth();
  const drive = new DriveClient(auth);
  const sheets = new XlsxSheetsGateway(drive);

  console.log('=== 1) Backup local da planilha original ===');
  const bytes = await drive.baixarArquivo(config.spreadsheetId);
  const pasta = path.join(process.cwd(), 'backups');
  await fs.mkdir(pasta, { recursive: true });
  const destino = path.join(pasta, `planilha-original-${config.spreadsheetId}.xlsx`);
  await fs.writeFile(destino, bytes);
  console.log(`  salvo: ${destino} (${(bytes.length / 1024).toFixed(1)} KB)`);

  console.log('\n=== 2) Conteúdo ANTES ===');
  const antes = await sheets.lerAba(config.spreadsheetId, config.abaClientes);
  for (const linha of antes) console.log('   ', linha.join(' | '));

  console.log('\n=== 3) Gravar estrutura nova (Clientes + GrupoFamiliar) ===');
  await sheets.escreverAbas(config.spreadsheetId, {
    [config.abaClientes]: [
      ['Nome', 'CPF', 'CEP', 'Cidade do protocolo', 'Telefone'],
      ['ANTONIO CARLOS DE SOUZA', '11122233344', '40000-000', 'Salvador', ''],
    ],
    [config.abaGrupoFamiliar]: [
      ['cpf_requerente', 'nome', 'parentesco', 'cpf', 'estado_civil', 'data_nascimento', 'renda'],
      [
        '11122233344',
        'ANTONIO CARLOS DE SOUZA',
        'Titular',
        '11122233344',
        'solteiro',
        '1970-02-11',
        '0',
      ],
    ],
  });
  console.log('  gravado ✓');

  console.log('\n=== 4) Ler de volta do Drive ===');
  const clientes = await sheets.lerAba(config.spreadsheetId, config.abaClientes);
  const grupo = await sheets.lerAba(config.spreadsheetId, config.abaGrupoFamiliar);
  console.log('  Clientes:');
  for (const linha of clientes) console.log('   ', linha.join(' | '));
  console.log('  GrupoFamiliar:');
  for (const linha of grupo) console.log('   ', linha.join(' | '));

  console.log('\n=== 5) Verificações ===');
  const ok = (rotulo: string, cond: boolean) =>
    console.log(`  ${cond ? '✓' : '✗'} ${rotulo}`);
  ok('coluna CEP presente', clientes[0]?.includes('CEP') === true);
  ok('CEP gravado', clientes[1]?.[2] === '40000-000');
  ok('aba GrupoFamiliar criada', grupo.length >= 2);
  ok('Titular registrado', grupo[1]?.[2] === 'Titular');

  console.log(`\n✅ ESCRITA NA PLANILHA REAL OK.`);
  console.log(`   Backup em: ${destino}`);
  console.log(`   Para desfazer: pnpm restaurar`);
}

main().catch((erro: unknown) => {
  const msg = erro instanceof Error ? erro.message : String(erro);
  console.error('\n❌ FALHOU:', msg);
  if (/storageQuota|storage quota/i.test(msg)) {
    console.error('   -> Service account não cria arquivos no Drive pessoal (sem cota).');
  } else if (/403|permission|insufficient/i.test(msg)) {
    console.error('   -> A service account precisa de permissão de EDITOR na planilha.');
  }
  process.exitCode = 1;
});
