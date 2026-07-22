import { carregarEnv } from './carregarEnv';
import { carregarConfig } from '../config/default';
import { criarAuth } from '../src/integrations/google/auth';
import { DriveClient } from '../src/integrations/drive/driveClient';
import { XlsxSheetsGateway } from '../src/integrations/sheets/xlsxSheets';

/**
 * Teste isolado da AUTENTICAÇÃO com o Google (`pnpm auth:test`).
 * Não passa pelo app: exercita direto criarAuth + DriveClient + XlsxSheetsGateway
 * contra o Drive real, para o erro (se houver) vir limpo.
 */
async function main(): Promise<void> {
  carregarEnv(); // .env não é carregado automaticamente em scripts avulsos

  const config = carregarConfig();

  console.log('=== Config ===');
  console.log('  key file    :', process.env.RPA_GOOGLE_KEY_FILE || '(vazio)');
  console.log('  pasta raiz  :', config.pastaRaizId || '(vazio)');
  console.log('  planilha    :', config.spreadsheetId || '(vazio)');
  console.log('  aba clientes:', config.abaClientes);

  if (!process.env.RPA_GOOGLE_KEY_FILE || !config.pastaRaizId || !config.spreadsheetId) {
    throw new Error('Faltam RPA_GOOGLE_KEY_FILE / RPA_PASTA_RAIZ_ID / RPA_SPREADSHEET_ID no .env');
  }

  console.log('\n=== 1) Autenticar (obter token) ===');
  const auth = criarAuth();
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  console.log('  token obtido:', token.token ? 'SIM ✓' : 'NÃO ✗');

  const drive = new DriveClient(auth);

  console.log('\n=== 2) Listar subpastas da pasta raiz (cada uma = 1 cliente) ===');
  const subpastas = await drive.listarSubpastas(config.pastaRaizId);
  console.log(`  ${subpastas.length} subpasta(s):`);
  for (const p of subpastas) console.log('   -', p.nome, `(${p.id})`);

  if (subpastas.length > 0) {
    const primeira = subpastas[0]!;
    console.log(`\n=== 3) Arquivos da 1ª pasta ("${primeira.nome}") ===`);
    const arquivos = await drive.listarArquivos(primeira.id);
    for (const a of arquivos) {
      console.log(`   - ${a.nome}  (${(a.tamanhoBytes / (1024 * 1024)).toFixed(2)} MB)`);
    }
  }

  console.log('\n=== 4) Ler a planilha .xlsx (download + parse) ===');
  const sheets = new XlsxSheetsGateway(drive);
  const linhas = await sheets.lerAba(config.spreadsheetId, config.abaClientes);
  console.log(`  ${linhas.length} linha(s). Cabeçalho:`, linhas[0]);
  if (linhas[1]) console.log('  1ª linha de dados:', linhas[1]);

  console.log('\n✅ AUTENTICAÇÃO OK — o robô consegue ler o Drive e a planilha reais.');
}

main().catch((erro: unknown) => {
  const msg = erro instanceof Error ? erro.message : String(erro);
  console.error('\n❌ FALHOU:', msg);
  if (/invalid_grant|Invalid JWT/.test(msg)) {
    console.error('   -> Relógio do PC fora de sincronia. Sincronize a hora do Windows.');
  } else if (/403|permission|insufficient/i.test(msg)) {
    console.error('   -> Sem permissão. Compartilhe a pasta com a service account:');
    console.error('      rpa-gerid-drive@rpa-gerid.iam.gserviceaccount.com (Leitor).');
  } else if (/404|not ?found/i.test(msg)) {
    console.error('   -> Pasta/planilha não encontrada (IDs errados ou não compartilhados).');
  } else if (/ENOENT|no such file/i.test(msg)) {
    console.error('   -> Arquivo da chave não encontrado. Confira RPA_GOOGLE_KEY_FILE no .env.');
  }
  process.exitCode = 1;
});
