import type { AppConfig } from '../../config/default';
import type { DriveGateway } from '../integrations/drive/driveGateway';
import type { SheetsGateway } from '../integrations/sheets/sheetsGateway';
import type { ClienteRevisao, ClienteValidado, ResultadoLeitura } from '../domain/types';
import { CodigoMotivo, motivo, type MotivoRevisao } from '../domain/motivos';
import { parseClientes, parseGrupoFamiliar } from '../domain/parsePlanilha';
import { agruparGrupoFamiliar, validarGrupoFamiliar } from '../domain/grupoFamiliar';
import { associar } from '../domain/associacao';
import { validarDadosCliente } from '../domain/validacaoCliente';
import { validarDocumentos } from '../domain/validacaoDocs';
import { apenasDigitos, normalizarCabecalho } from '../domain/texto';

/**
 * MÓDULO 1 — leitura e validação de dados.
 * Orquestra: lista subpastas + lê as duas abas + associa pasta<->cliente +
 * valida (dados do cliente, documentos, grupo familiar). Depende só das PORTS
 * (DriveGateway/SheetsGateway), então roda com mocks ou com o Google real.
 */
export async function lerDados(
  config: AppConfig,
  drive: DriveGateway,
  sheets: SheetsGateway,
): Promise<ResultadoLeitura> {
  const [todasSubpastas, rowsClientes, rowsGrupoFamiliar] = await Promise.all([
    drive.listarSubpastas(config.pastaRaizId),
    sheets.lerAba(config.spreadsheetId, config.abaClientes),
    sheets.lerAba(config.spreadsheetId, config.abaGrupoFamiliar),
  ]);

  // Remove pastas que não são clientes (ex.: "Protocolado", destino pós-protocolo).
  const ignoradas = new Set(config.pastasIgnoradas.map((n) => normalizarCabecalho(n)));
  const subpastas = todasSubpastas.filter((p) => !ignoradas.has(normalizarCabecalho(p.nome)));

  const clientes = parseClientes(rowsClientes, config.mapeamentoClientes);
  const gruposPorCpf = agruparGrupoFamiliar(
    parseGrupoFamiliar(rowsGrupoFamiliar, config.mapeamentoGrupoFamiliar),
  );

  const { pares, pastasSemCliente, clientesSemPasta } = associar(subpastas, clientes);

  const clientesProntos: ClienteValidado[] = [];
  const clientesParaRevisao: ClienteRevisao[] = [];

  for (const { pasta, cliente } of pares) {
    const motivos: MotivoRevisao[] = [];
    const arquivos = await drive.listarArquivos(pasta.id);

    motivos.push(...validarDadosCliente(cliente));
    motivos.push(
      ...validarDocumentos(arquivos, {
        documentosEsperados: config.documentosEsperados,
        limiteTamanhoArquivoBytes: config.limiteTamanhoArquivoBytes,
      }),
    );

    const grupoFamiliar = gruposPorCpf.get(apenasDigitos(cliente.cpf));
    motivos.push(...validarGrupoFamiliar(grupoFamiliar, cliente));

    if (motivos.length === 0 && grupoFamiliar) {
      clientesProntos.push({ cliente, pastaId: pasta.id, grupoFamiliar, arquivos });
    } else {
      // Guarda o que já foi coletado — a tela de detalhe mostra o que existe,
      // não só a lista de problemas.
      clientesParaRevisao.push({
        pasta: cliente.pasta || pasta.nome,
        cpf: cliente.cpf || undefined,
        motivos,
        cliente,
        arquivos,
        ...(grupoFamiliar ? { grupoFamiliar } : {}),
      });
    }
  }

  for (const pasta of pastasSemCliente) {
    // Sem linha na planilha não há dados do cliente, mas os arquivos da pasta
    // ajudam o operador a identificar de quem é.
    const arquivos = await drive.listarArquivos(pasta.id);
    clientesParaRevisao.push({
      pasta: pasta.nome,
      motivos: [
        motivo(
          CodigoMotivo.PASTA_SEM_LINHA_PLANILHA,
          `Pasta "${pasta.nome}" não tem linha correspondente na aba ${config.abaClientes}.`,
          { pastaId: pasta.id },
        ),
      ],
      arquivos,
    });
  }

  for (const cliente of clientesSemPasta) {
    const grupoFamiliar = gruposPorCpf.get(apenasDigitos(cliente.cpf));
    clientesParaRevisao.push({
      pasta: cliente.pasta || '(sem nome de pasta)',
      cpf: cliente.cpf || undefined,
      motivos: [
        motivo(
          CodigoMotivo.LINHA_SEM_PASTA,
          `Cliente "${cliente.nome || cliente.cpf}" não tem pasta correspondente no Drive.`,
          { pastaEsperada: cliente.pasta },
        ),
      ],
      cliente,
      ...(grupoFamiliar ? { grupoFamiliar } : {}),
    });
  }

  return {
    clientesProntos,
    clientesParaRevisao,
    resumo: {
      total: clientesProntos.length + clientesParaRevisao.length,
      prontos: clientesProntos.length,
      revisao: clientesParaRevisao.length,
    },
  };
}
