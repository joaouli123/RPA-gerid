import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { carregarEnv } from './carregarEnv';
import { carregarConfig } from '../config/default';
import { criarAuth } from '../src/integrations/google/auth';
import { DriveClient } from '../src/integrations/drive/driveClient';
import { XlsxSheetsGateway } from '../src/integrations/sheets/xlsxSheets';
import { lerDados } from '../src/modulo1/lerDados';
import { classificarDocumentos } from '../src/domain/validacaoDocs';
import { apenasDigitos } from '../src/domain/texto';
import { RoboGeridPlaywright } from '../src/modulo2/roboGerid';
import type { ArquivoLocal } from '../src/modulo2/preencherGerid';

/**
 * SESSÃO DE VALIDAÇÃO DO PREENCHIMENTO (`pnpm gerid:testar [CPF]`).
 *
 * Roda na MÁQUINA do advogado, com o GERID já logado no perfil do Chrome
 * apontado por RPA_PERFIL_NAVEGADOR. Pega UM caso pronto (o primeiro, ou o CPF
 * passado), baixa os documentos, abre o GERID e preenche até a tela de
 * Confirmar — e PARA. Nada é enviado ao INSS: quem revisa e conclui é o
 * advogado. Serve para conferir, ao vivo, se os seletores batem com a tela real.
 *
 * Pré-requisitos:
 *   - RPA_GOOGLE_* configurado (lê Drive/planilha);
 *   - RPA_PERFIL_NAVEGADOR = pasta de um Chrome já logado no GERID;
 *   - RPA_GERID_URL apontando para o portal (novorequerimento.inss.gov.br).
 */
async function main(): Promise<void> {
  carregarEnv();
  const config = carregarConfig();

  const auth = criarAuth();
  const drive = new DriveClient(auth);
  const sheets = new XlsxSheetsGateway(drive);

  console.log('Lendo os casos prontos...');
  const dados = await lerDados(config, drive, sheets);
  const cpfAlvo = apenasDigitos(process.argv[2]);

  const caso = cpfAlvo
    ? dados.clientesProntos.find((c) => apenasDigitos(c.cliente.cpf) === cpfAlvo)
    : dados.clientesProntos[0];

  if (!caso) {
    const lista = dados.clientesProntos.map((c) => `${c.cliente.nome} (${c.cliente.cpf})`);
    throw new Error(
      cpfAlvo
        ? `Nenhum caso pronto com CPF ${cpfAlvo}. Prontos: ${lista.join('; ') || '(nenhum)'}`
        : `Nenhum caso pronto para testar. Ajuste um caso na tela de Revisão primeiro.`,
    );
  }

  console.log(`\nCaso escolhido: ${caso.cliente.nome} (${caso.cliente.cpf})`);
  console.log(`Grupo familiar: ${caso.grupoFamiliar.integrantes.length} pessoa(s).`);

  // Baixa os documentos para uma pasta temporária, cada um com seu tipo.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gerid-'));
  const arquivos: ArquivoLocal[] = [];
  for (const { doc, arquivos: casados } of classificarDocumentos(caso.arquivos, config.documentosEsperados)) {
    for (const a of casados) {
      const destino = path.join(tmp, a.nome);
      await fs.writeFile(destino, await drive.baixarArquivo(a.id));
      arquivos.push({ tipo: doc.tipo, caminho: destino });
    }
  }
  console.log(`${arquivos.length} documento(s) baixado(s) para ${tmp}.`);

  const robo = new RoboGeridPlaywright({
    urlGerid: process.env.RPA_GERID_URL ?? 'https://novorequerimento.inss.gov.br',
    perfilNavegador: process.env.RPA_PERFIL_NAVEGADOR ?? path.join(process.cwd(), '.perfil-gerid'),
    headless: false, // o advogado acompanha
    pastaSaida: path.join(process.cwd(), 'saida'),
    timeoutMs: Number(process.env.RPA_TIMEOUT_MS ?? 30000),
  });

  console.log('\nAbrindo o GERID (reaproveitando a sessão logada)...');
  await robo.iniciar();

  console.log('Preenchendo até a tela de Confirmar (o robô NÃO conclui)...\n');
  const resultado = await robo.preencherAteConfirmar(
    { cliente: caso.cliente, grupoFamiliar: caso.grupoFamiliar, arquivos: caso.arquivos, pastaId: caso.pastaId },
    {
      procuradorCpf: config.procurador.cpf,
      telefonePadrao: config.telefonePadrao,
      emailEscritorio: config.procurador.email,
      arquivos,
    },
  );

  console.log(`\n✅ Cheguei em: ${resultado.telaAtual}. O robô parou — revise e conclua você mesmo.`);
  if (resultado.avisos.length > 0) {
    console.log('\n⚠️ Confira estes pontos antes de concluir:');
    for (const aviso of resultado.avisos) console.log('   -', aviso);
  } else {
    console.log('\nNenhum aviso — mas confira tudo na tela antes de concluir.');
  }

  console.log('\nO navegador ficou aberto na tela de Confirmar. Feche quando terminar.');
  // De propósito NÃO chama robo.encerrar(): a janela fica aberta para a revisão.
}

main().catch((erro: unknown) => {
  console.error('\n❌ FALHOU:', erro instanceof Error ? erro.message : String(erro));
  process.exitCode = 1;
});
