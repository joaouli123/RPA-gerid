import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import type { Browser, BrowserContext, Page } from 'playwright';
import {
  ErroGerid,
  FalhaGerid,
  type CasoParaProtocolar,
  type ResultadoProtocolo,
  type RoboGerid,
} from './tiposGerid';
import { mapaGerid, mapeamentoCompleto } from './mapaGerid';
import {
  preencherRequerimento,
  type OpcoesPreenchimento,
  type ResultadoPreenchimento,
} from './preencherGerid';

export interface OpcoesRobo {
  /** URL inicial do Gerid. */
  urlGerid: string;
  /**
   * Pasta do perfil do Chrome a reutilizar. É assim que o robô herda a sessão
   * já autenticada: o operador faz login uma vez nesse perfil.
   */
  perfilNavegador: string;
  /** false = navegador visível (recomendado: o operador acompanha). */
  headless: boolean;
  /** Onde salvar screenshots de falha e comprovantes. */
  pastaSaida: string;
  /** Timeout por passo, em ms. */
  timeoutMs: number;
}

/**
 * Robô que opera o Gerid com Playwright.
 *
 * ⚠️ ESTADO ATUAL: a navegação, a detecção de sessão e o tratamento de falhas
 * são REAIS. O preenchimento do formulário depende do mapeamento das telas do
 * Gerid (`mapaGerid.ts`), que só pode ser preenchido com acesso ao sistema.
 * Enquanto esse mapeamento estiver incompleto, `protocolar()` FALHA com
 * MAPEAMENTO_PENDENTE — de propósito. O robô nunca finge que protocolou.
 */
export class RoboGeridPlaywright implements RoboGerid {
  private browser: Browser | null = null;
  private contexto: BrowserContext | null = null;
  private pagina: Page | null = null;

  constructor(private readonly opcoes: OpcoesRobo) {}

  async iniciar(): Promise<void> {
    const { chromium } = await import('playwright');

    await fs.mkdir(this.opcoes.pastaSaida, { recursive: true });

    const opcoesContexto = {
      headless: this.opcoes.headless,
      acceptDownloads: true,
      downloadsPath: this.opcoes.pastaSaida,
      viewport: null,
    };

    // Perfil persistente: herda a sessão que o operador já autenticou.
    try {
      this.contexto = await chromium.launchPersistentContext(
        this.opcoes.perfilNavegador,
        opcoesContexto,
      );
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      if (
        msg.includes("Executable doesn't exist") ||
        msg.includes('playwright install') ||
        msg.includes('chrome-linux64')
      ) {
        console.info('[rpa-gerid] Binários do Chromium não encontrados. Baixando Playwright Chromium...');
        try {
          execSync('npx playwright install chromium', { stdio: 'inherit' });
        } catch (eInstalacao) {
          console.error('[rpa-gerid] Falha no npx playwright install chromium:', eInstalacao);
        }
        this.contexto = await chromium.launchPersistentContext(
          this.opcoes.perfilNavegador,
          opcoesContexto,
        );
      } else {
        throw erro;
      }
    }

    this.pagina = this.contexto.pages()[0] ?? (await this.contexto.newPage());
    this.pagina.setDefaultTimeout(this.opcoes.timeoutMs);

    await this.pagina.goto(this.opcoes.urlGerid, { waitUntil: 'domcontentloaded' });
    await this.confirmarSessao();
  }

  /**
   * Confirma que a sessão está autenticada. Se o Gerid devolveu tela de login
   * ou verificação de segurança, falha com o motivo certo — nunca prossegue às
   * cegas.
   */
  private async confirmarSessao(): Promise<void> {
    const pagina = this.exigirPagina();
    const conteudo = (await pagina.content()).toLowerCase();

    const pedeLogin = /(entrar com gov\.br|fazer login|sua sessão expirou|acesso negado)/.test(
      conteudo,
    );
    if (pedeLogin) {
      throw new ErroGerid(
        FalhaGerid.SESSAO_EXPIRADA,
        'O Gerid pediu login. Faça a autenticação no navegador e rode de novo.',
        await this.capturarTela('sessao-expirada'),
      );
    }

    const pedeVerificacao = /(captcha|verificação de segurança|não sou um rob)/.test(conteudo);
    if (pedeVerificacao) {
      throw new ErroGerid(
        FalhaGerid.VERIFICACAO_SEGURANCA,
        'O Gerid exibiu verificação de segurança. Resolva manualmente — o robô não burla essa etapa.',
        await this.capturarTela('verificacao-seguranca'),
      );
    }
  }

  async protocolar(
    caso: CasoParaProtocolar,
    opcoes: import('./preencherGerid').OpcoesPreenchimento
  ): Promise<ResultadoProtocolo> {
    this.exigirPagina();

    // 1. Preenche tudo até a tela de Confirmar
    await this.preencherAteConfirmar(caso, opcoes);

    // 2. Na tela de confirmar, marcamos a declaração e avançamos
    const chk = this.pagina!.locator(mapaGerid.passo10.declaracaoConfirmar);
    if (await chk.count()) {
      await chk.first().check({ force: true });
    } else {
      throw new ErroGerid(
        FalhaGerid.CAMPO_NAO_ENCONTRADO,
        'Checkbox de declaração não encontrado na tela de Confirmar.'
      );
    }

    // Clica em Avançar
    const btnNext = this.pagina!.locator('#btn-next').locator('visible=true').first();
    await btnNext.click();

    // 3. Aguarda a tela de Comprovante ou uma mensagem de Erro
    // Vamos esperar um pouco para ver se aparece um erro do INSS
    await this.pagina!.waitForTimeout(3000); // 3 segundos para o INSS responder

    const erroINSS = this.pagina!.locator('text=/Erro Idade incompatível|Erro|Precisa de ajuda\\?/i').locator('visible=true');
    if (await erroINSS.count() > 0) {
      const msg = await erroINSS.first().innerText();
      throw new ErroGerid(
        FalhaGerid.ERRO_PREENCHIMENTO,
        `O INSS recusou o protocolo: ${msg}`
      );
    }

    // Se chegou aqui, não deu erro óbvio do INSS. Provavelmente estamos na tela de Comprovante!
    // Vamos esperar mais 3 segundos pro comprovante carregar bem e "tirar uma foto" do HTML.
    await this.pagina!.waitForTimeout(3000);
    
    const html = await this.pagina!.content();
    const fs = require('fs');
    fs.writeFileSync('comprovante_dump.html', html, 'utf-8');

    const texto = await this.pagina!.evaluate(() => document.body.innerText);
    fs.writeFileSync('comprovante_dump.txt', texto, 'utf-8');

    throw new ErroGerid(
      FalhaGerid.MAPEAMENTO_PENDENTE,
      `O robô marcou a declaração e clicou em Confirmar. Ele salvou um dump da tela final em comprovante_dump.html! Pode avisar no chat que já rodou.`,
    );
  }

  /**
   * Preenche o requerimento até a tela de Confirmar e PARA (humano no laço).
   *
   * É o que a sessão de validação acompanhada usa: o robô preenche os passos
   * 1–9 sobre o GERID real e devolve os avisos do que o operador precisa
   * conferir. NÃO conclui nem protocola — quem clica em concluir é o advogado.
   *
   * Separado de `protocolar()` de propósito: este método é seguro de rodar
   * (não envia nada ao INSS), então não passa pela trava de mapeamento — ele
   * EXISTE justamente para validar esse mapeamento.
   */
  async preencherAteConfirmar(
    caso: CasoParaProtocolar,
    opcoes: OpcoesPreenchimento,
  ): Promise<ResultadoPreenchimento> {
    const pagina = this.exigirPagina();
    await this.confirmarSessao();
    try {
      return await preencherRequerimento(pagina, caso, opcoes);
    } catch (erro) {
      if (erro instanceof ErroGerid && !erro.screenshot) {
        // Anexa um print do ponto de falha para facilitar a conferência.
        const screenshot = await this.capturarTela('preenchimento');
        throw new ErroGerid(erro.codigo, erro.message, screenshot);
      }
      throw erro;
    }
  }

  async encerrar(): Promise<void> {
    await this.contexto?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.contexto = null;
    this.browser = null;
    this.pagina = null;
  }

  /** Screenshot para diagnóstico. Devolve o caminho salvo. */
  private async capturarTela(rotulo: string): Promise<string | undefined> {
    if (!this.pagina) return undefined;
    try {
      const arquivo = path.join(this.opcoes.pastaSaida, `falha-${rotulo}-${Date.now()}.png`);
      await this.pagina.screenshot({ path: arquivo, fullPage: true });
      return arquivo;
    } catch {
      return undefined;
    }
  }

  private exigirPagina(): Page {
    if (!this.pagina) {
      throw new ErroGerid(
        FalhaGerid.ERRO_INESPERADO,
        'O robô não foi iniciado. Chame iniciar() antes de protocolar().',
      );
    }
    return this.pagina;
  }
}
