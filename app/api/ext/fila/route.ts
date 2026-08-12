import { NextResponse } from 'next/server';
import {
  garantirFonteConfiavelParaExecucao,
  getConfig,
  getExecucaoAtual,
  getResultado,
} from '@/lib/server/store';
import { classificarDocumentos } from '@/src/domain/validacaoDocs';
import { apenasDigitos } from '@/src/domain/texto';
import { autorizarExtensao } from '@/lib/server/extensaoAuth';

// Permite chamadas do navegador (CORS) caso a extensão chame diretamente
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(req: Request) {
  try {
    const auth = autorizarExtensao(req);
    if (!auth.ok) {
      return NextResponse.json({ sucesso: false, erro: auth.erro }, { status: 401, headers: corsHeaders });
    }
    const atual = await getExecucaoAtual();

    // Consultar a fila nunca pode iniciar um protocolo. A extensão chama esta
    // rota ao abrir o popup; uma execução só nasce por ação explícita no painel.
    if (!atual || atual.status !== 'rodando') {
      return NextResponse.json({ sucesso: true, idExecucao: null, casos: [] }, { headers: corsHeaders });
    }

    // Fila pausada não entrega caso. A execução continua aberta e os casos
    // continuam `pendente` — a pausa só impede pegar trabalho novo, inclusive
    // quando alguém clica em Iniciar na extensão durante a pausa.
    if (atual.pausadaEm) {
      return NextResponse.json(
        {
          sucesso: true,
          idExecucao: atual.id,
          pausada: true,
          pausadaEm: atual.pausadaEm,
          casos: [],
          // Quantos AINDA esperam. `casos: []` sozinho faria o popup anunciar
          // "0 pendentes" numa fila que so esta parada — mentira por omissao.
          pendentes: atual.casos.filter(
            (c) => c.status === 'pendente' || c.status === 'processando',
          ).length,
        },
        { headers: corsHeaders },
      );
    }

    const [resultado, config] = await Promise.all([getResultado(), getConfig()]);
    garantirFonteConfiavelParaExecucao();
    const prontosPorCpf = new Map(
      resultado.clientesProntos.map((c) => [apenasDigitos(c.cliente.cpf), c]),
    );

    // Retorna apenas os casos pendentes, com o payload completo necessário ao
    // preenchimento. Arquivos vão por URL autenticada e só durante esta execução.
    const pendentes = atual.casos.filter(c => c.status === 'pendente' || c.status === 'processando');
    const casos = pendentes.map((caso) => {
      const completo = prontosPorCpf.get(apenasDigitos(caso.cpf));
      if (!completo) throw new Error(`Caso ${caso.cpf} não foi encontrado entre os prontos.`);

      const anexos = classificarDocumentos(completo.arquivos, config.documentosEsperados)
        .flatMap(({ doc, arquivos }) => arquivos.map((arquivo) => ({
          id: arquivo.id,
          nome: arquivo.nome,
          mimeType: arquivo.mimeType,
          tipo: doc.tipo,
        })));

      return {
        ...caso,
        dados: completo,
        configuracao: {
          procuradorCpf: config.procurador.cpf,
          telefonePadrao: completo.cliente.telefone || config.telefonePadrao,
          emailEscritorio: config.procurador.email,
        },
        anexos,
      };
    });

    return NextResponse.json({ 
      sucesso: true, 
      idExecucao: atual.id,
      casos
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Erro na API de fila:', error);
    return NextResponse.json({ 
      sucesso: false, 
      erro: error instanceof Error ? error.message : 'Erro interno' 
    }, { status: 500, headers: corsHeaders });
  }
}
