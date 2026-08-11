"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // src/playwright-polyfill.ts
  function estaInteragivel(elemento) {
    return elemento instanceof HTMLInputElement && elemento.type === "file" || elemento.offsetParent !== null;
  }
  function casaTexto(elemento, esperado, exato = false) {
    const texto = elemento.textContent?.trim() ?? "";
    if (typeof esperado === "string") return exato ? texto === esperado : texto.includes(esperado);
    esperado.lastIndex = 0;
    return esperado.test(texto);
  }
  function definirPropriedadeNativa(elemento, propriedade, valor) {
    const prototipo = elemento instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototipo, propriedade)?.set;
    if (setter) setter.call(elemento, valor);
    else elemento[propriedade] = valor;
  }
  function clicarComoUsuario(elemento) {
    elemento.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 1,
      view: window
    }));
    elemento.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 0,
      view: window
    }));
    elemento.click();
  }
  var MockLocator, MockPage;
  var init_playwright_polyfill = __esm({
    "src/playwright-polyfill.ts"() {
      "use strict";
      MockLocator = class _MockLocator {
        selector;
        parent;
        constructor(selector, parent) {
          this.selector = selector;
          this.parent = parent;
        }
        // Encontra o elemento no DOM real usando document.querySelector ou dentro do parent
        async _getElement() {
          const root = this.parent ? await this.parent._getElement() : document;
          if (!root) return null;
          const elementos = Array.from(root.querySelectorAll(this.selector));
          return elementos.find(estaInteragivel) ?? elementos[0] ?? null;
        }
        // Wait with timeout
        async _waitForElement(timeout = 5e3) {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const el = await this._getElement();
            if (el) {
              if (el.tagName === "INPUT" && el.type === "file") return el;
              if (el.offsetParent !== null) return el;
            }
            await new Promise((r) => setTimeout(r, 25));
          }
          throw new Error(`Timeout waiting for selector: ${this.selector}`);
        }
        async waitFor(options) {
          const estado = options?.state || "visible";
          const limite = Date.now() + (options?.timeout || 5e3);
          while (Date.now() < limite) {
            const elemento = await this._getElement();
            const anexado = Boolean(elemento?.isConnected);
            const visivel2 = Boolean(elemento && estaInteragivel(elemento));
            if (estado === "visible" && visivel2 || estado === "hidden" && !visivel2 || estado === "attached" && anexado || estado === "detached" && !anexado) return;
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          throw new Error(`Timeout waiting for selector (${estado}): ${this.selector}`);
        }
        async count() {
          try {
            const root = this.parent ? await this.parent._getElement() : document;
            if (!root) return 0;
            return Array.from(root.querySelectorAll(this.selector)).filter(estaInteragivel).length;
          } catch {
            return 0;
          }
        }
        async countAttached() {
          try {
            const root = this.parent ? await this.parent._getElement() : document;
            return root ? root.querySelectorAll(this.selector).length : 0;
          } catch {
            return 0;
          }
        }
        locator(subSelector) {
          return new _MockLocator(subSelector, this);
        }
        first() {
          return this;
        }
        last() {
          const sel = this.selector;
          const parent = this.parent;
          const l = new _MockLocator(sel, parent);
          l._getElement = async () => {
            const root = parent ? await parent._getElement() : document;
            if (!root) return null;
            const els = Array.from(root.querySelectorAll(sel));
            const visiveis = els.filter(estaInteragivel);
            return visiveis[visiveis.length - 1] ?? els[els.length - 1] ?? null;
          };
          return l;
        }
        nth(index) {
          const sel = this.selector;
          const parent = this.parent;
          const l = new _MockLocator(sel, parent);
          l._getElement = async () => {
            const root = parent ? await parent._getElement() : document;
            if (!root) return null;
            const els = Array.from(root.querySelectorAll(sel));
            const visiveis = els.filter(estaInteragivel);
            return visiveis[index] ?? els[index] ?? null;
          };
          return l;
        }
        async click() {
          const el = await this._waitForElement();
          if ((el instanceof HTMLButtonElement || el instanceof HTMLInputElement) && (el.disabled || el.getAttribute("aria-disabled") === "true")) {
            throw new Error(`Element is disabled: ${this.selector}`);
          }
          clicarComoUsuario(el);
        }
        async fill(value) {
          const el = await this._waitForElement();
          definirPropriedadeNativa(el, "value", value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        async inputValue() {
          const el = await this._waitForElement();
          return el.value || "";
        }
        async isVisible() {
          const el = await this._getElement();
          return !!el && estaInteragivel(el);
        }
        async isAttached() {
          const el = await this._getElement();
          return Boolean(el?.isConnected);
        }
        async isEnabled() {
          const el = await this._getElement();
          return !!el && !el.disabled && el.getAttribute("aria-disabled") !== "true";
        }
        async isChecked() {
          const el = await this._getElement();
          return !!el?.checked;
        }
        async check(options) {
          const encontrado = options?.force ? await this._getElement() : await this._waitForElement();
          if (!(encontrado instanceof HTMLInputElement)) {
            throw new Error(`Input nao encontrado para marcar: ${this.selector}`);
          }
          const el = encontrado;
          if (!el.checked) {
            const controle = el.closest(".interaction-select");
            clicarComoUsuario(controle ?? el);
            if (!controle && !el.checked) {
              definirPropriedadeNativa(el, "checked", true);
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
          const limite = Date.now() + 1500;
          while (!el.checked && Date.now() < limite) {
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          if (!el.checked) {
            throw new Error(`O GERID n\xE3o confirmou a marca\xE7\xE3o de ${this.selector}.`);
          }
        }
        async getAttribute(name) {
          return (await this._getElement())?.getAttribute(name) ?? null;
        }
        async innerText() {
          return (await this._waitForElement()).innerText;
        }
        async evaluate(fn, arg) {
          return fn(await this._waitForElement(), arg);
        }
        async setInputFiles(entrada) {
          const arquivos = Array.isArray(entrada) ? entrada : [entrada];
          if (arquivos.some((arquivo) => typeof arquivo === "string")) {
            throw new Error("A extens\xE3o precisa receber o conte\xFAdo do anexo, n\xE3o um caminho local.");
          }
          const el = await this._waitForElement();
          const transferencia = new DataTransfer();
          for (const arquivo of arquivos) {
            if (typeof arquivo === "string") continue;
            const binario = atob(arquivo.base64);
            const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
            transferencia.items.add(new File(
              [bytes],
              arquivo.nome,
              { type: arquivo.mimeType || "application/octet-stream" }
            ));
          }
          el.files = transferencia.files;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        filter(options) {
          const sel = this.selector;
          const parent = this.parent;
          const l = new _MockLocator(sel, parent);
          l._getElement = async () => {
            const root = parent ? await parent._getElement() : document;
            if (!root) return null;
            const els = Array.from(root.querySelectorAll(sel));
            return els.find((e) => estaInteragivel(e) && casaTexto(e, options.hasText)) || null;
          };
          return l;
        }
      };
      MockPage = class {
        locator(selector) {
          return new MockLocator(selector);
        }
        async waitForSelector(selector) {
          return new MockLocator(selector)._waitForElement();
        }
        async evaluate(fn, arg) {
          return fn(arg);
        }
        getByText(text, options) {
          const l = new MockLocator("*");
          l._getElement = async () => {
            const els = Array.from(document.querySelectorAll("*"));
            return els.find((e) => {
              if (e.children.length > 0) return false;
              return estaInteragivel(e) && casaTexto(e, text, options?.exact);
            }) || null;
          };
          return l;
        }
        getByLabel(text) {
          const l = new MockLocator("label");
          l._getElement = async () => {
            const els = Array.from(document.querySelectorAll("label"));
            const label = els.find((e) => estaInteragivel(e) && casaTexto(e, text));
            if (label && label.htmlFor) {
              return document.getElementById(label.htmlFor);
            }
            return null;
          };
          return l;
        }
        getByPlaceholder(text) {
          const l = new MockLocator("input, textarea");
          l._getElement = async () => {
            const els = Array.from(document.querySelectorAll("input, textarea"));
            return els.find((e) => {
              if (!estaInteragivel(e) || !e.placeholder) return false;
              if (typeof text === "string") return e.placeholder.includes(text);
              text.lastIndex = 0;
              return text.test(e.placeholder);
            }) || null;
          };
          return l;
        }
        getByRole(role, options) {
          const l = new MockLocator(`[role="${role}"], button, input[type="${role}"]`);
          l._getElement = async () => {
            let els = Array.from(document.querySelectorAll(`button, [role="${role}"], input[type="${role}"]`));
            els = els.filter(estaInteragivel);
            if (options?.name) {
              els = els.filter((e) => {
                const nome = (e.getAttribute("aria-label") || e.innerText || e.textContent || e.value || "").trim().replace(/\s+/g, " ");
                if (typeof options.name === "string") return nome.includes(options.name);
                options.name.lastIndex = 0;
                return options.name.test(nome);
              });
            }
            return els[0] || null;
          };
          return l;
        }
        async waitForLoadState() {
          return;
        }
      };
    }
  });

  // src/tiposGerid.ts
  var FalhaGerid, ErroGerid;
  var init_tiposGerid = __esm({
    "src/tiposGerid.ts"() {
      "use strict";
      FalhaGerid = {
        SESSAO_EXPIRADA: "SESSAO_EXPIRADA",
        VERIFICACAO_SEGURANCA: "VERIFICACAO_SEGURANCA",
        CAMPO_NAO_ENCONTRADO: "CAMPO_NAO_ENCONTRADO",
        ERRO_PREENCHIMENTO: "ERRO_PREENCHIMENTO",
        FALHA_UPLOAD: "FALHA_UPLOAD",
        FALHA_DOWNLOAD_COMPROVANTE: "FALHA_DOWNLOAD_COMPROVANTE",
        MAPEAMENTO_PENDENTE: "MAPEAMENTO_PENDENTE",
        ERRO_INESPERADO: "ERRO_INESPERADO"
      };
      ErroGerid = class extends Error {
        constructor(codigo, mensagem, screenshot) {
          super(mensagem);
          this.codigo = codigo;
          this.screenshot = screenshot;
          this.name = "ErroGerid";
        }
        codigo;
        screenshot;
      };
    }
  });

  // src/domain/texto.ts
  function removerAcentos(s) {
    return s.normalize("NFD").replace(DIACRITICOS, "");
  }
  function normalizar(s) {
    return removerAcentos((s ?? "").toString().trim().toLowerCase());
  }
  function normalizarCabecalho(s) {
    return normalizar(s).replace(/[_\s]+/g, " ").trim();
  }
  function apenasDigitos(s) {
    return (s ?? "").toString().replace(/\D+/g, "");
  }
  var DIACRITICOS;
  var init_texto = __esm({
    "src/domain/texto.ts"() {
      "use strict";
      DIACRITICOS = /[̀-ͯ]/g;
    }
  });

  // src/mapaGerid.ts
  var NAVEGACAO, mapaGerid;
  var init_mapaGerid = __esm({
    "src/mapaGerid.ts"() {
      "use strict";
      NAVEGACAO = {
        avancar: "#btn-next",
        voltar: "#btn-prev",
        novoRequerimento: "Novo Requerimento"
      };
      mapaGerid = {
        url: "https://atendimento.inss.gov.br",
        urlTarefas: "https://atendimento.inss.gov.br/requerimentos",
        passo1: {
          campoBusca: 'input[id="idSelecionarServico"]',
          containerOpcoes: "#idSelecionarServico-itens",
          servicoBpcPcd: "1655"
        },
        passo2: {
          // ⚠️ o id TEM um ponto: `#idRequerente.cpf` em CSS vira id + classe.
          cpf: 'input[id="idRequerente.cpf"]',
          dataNascimento: 'input[id="nascimentoRequerente"]',
          nome: 'input[id="nomeRequerente"]',
          // Mapeamentos novos (ex: Acordo Internacional / Acompanhar Processo)
          acompanharProcessoSim: 'input[id="acompanharProcesso-Sim"]',
          acompanharProcessoNao: 'input[id="acompanharProcesso-Nao"]',
          paisesAcordo: 'input[id="paisesAcordo"]'
        },
        passo3: {
          autorizacaoCadUnico: 'input[id="campo-autorizacaoCadunico"]'
        },
        passo4: {
          parentesco: (i) => `#selectParentesco${i}`,
          estadoCivil: (i) => `#selectEstadoCivil${i}`,
          // ⚠️ o prefixo "undefined-" é bug de template do INSS; pode sumir se
          // corrigirem. Por isso o robô tenta por id e cai para o rótulo.
          incluirExcluirNao: 'input[id="undefined-Nao"]',
          incluirExcluirSim: 'input[id="undefined-Sim"]'
        },
        passo7: {
          tipoContato: "#selectTipoContato",
          acompanharProcessoSim: 'input[id="acompanharProcesso-Sim"]',
          inputArquivo: 'input[type="file"]',
          totalSlots: 11
        },
        passo8: {
          cepRotulo: "CEP",
          cepPlaceholder: "__.___-___",
          abaCep: "Consultar por CEP",
          abaMunicipio: "Consultar por Munic\xEDpio",
          buscar: "Buscar",
          cardUnidade: ".unidade"
        },
        passo9: {
          municipio: "#orgaoPagadorMunicipio",
          radioOrgaoPagador: 'table tbody input[type="radio"]'
        },
        passo10: {
          declaracaoConfirmar: 'input[id="campo-declaracaoConfirmar"]'
        },
        // -------------------------------------------------------------------------
        // 07/08/2026 — passos 1 a 10 validados no DOM real. O robô para na revisão
        // final e nunca marca a declaração nem envia o requerimento sozinho.
        // -------------------------------------------------------------------------
        pendencias: []
      };
    }
  });

  // src/estadoGerid.ts
  function estaVisivel(elemento) {
    if (!(elemento instanceof HTMLElement)) return false;
    if (elemento instanceof HTMLInputElement && elemento.type === "file") {
      return Boolean(elemento.closest(".containerAnexo")?.offsetParent);
    }
    return elemento.offsetParent !== null;
  }
  function normalizar2(texto) {
    return (texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function textoVisivel(documento) {
    return normalizar2(documento.body?.innerText);
  }
  function seletorVisivel(documento, seletor) {
    return Array.from(documento.querySelectorAll(seletor)).some(estaVisivel);
  }
  function detectarEstadoGerid(documento = document) {
    const texto = textoVisivel(documento);
    const dialogos = Array.from(documento.querySelectorAll('[role="dialog"]')).filter(estaVisivel);
    const modalContatos = dialogos.some((dialogo) => normalizar2(dialogo.innerText).includes("contatos"));
    const modalConfirmacao = dialogos.some((dialogo) => {
      const conteudo = normalizar2(dialogo.innerText);
      return conteudo.includes("atencao") && conteudo.includes("confirmar");
    });
    let etapa = "desconhecido";
    if (texto.includes("login - pat") && texto.includes("abrangencia")) etapa = "autenticacao_pat";
    else if (texto.includes("certificado digital do tipo a3")) etapa = "aviso_certificado_a3";
    else if (seletorVisivel(documento, 'input[id="campo-declaracaoConfirmar"]')) etapa = "passo_10";
    else if (texto.includes("protocolo") && Array.from(documento.querySelectorAll("h1, h2, h3")).some(
      (titulo) => estaVisivel(titulo) && normalizar2(titulo.innerText) === "comprovante"
    )) etapa = "comprovante";
    else if (seletorVisivel(documento, "#orgaoPagadorMunicipio")) etapa = "passo_9";
    else if (seletorVisivel(documento, 'input[placeholder="__.___-___"]') || texto.includes("selecionar unidade") && texto.includes("consultar por cep")) etapa = "passo_8";
    else if (seletorVisivel(documento, 'input[id="acompanharProcesso-Sim"]') && seletorVisivel(documento, ".containerAnexo")) etapa = "passo_7";
    else if (seletorVisivel(documento, 'input[id^="perguntaSUAS-"]')) etapa = "passo_6";
    else if (seletorVisivel(documento, 'input[id^="perguntaGastos-"]')) etapa = "passo_5";
    else if (seletorVisivel(documento, 'input[id^="selectEstadoCivil"]')) etapa = "passo_4";
    else if (seletorVisivel(documento, 'input[id="campo-autorizacaoCadunico"]')) etapa = "passo_3";
    else if (seletorVisivel(documento, 'input[id="idRequerente.cpf"]')) etapa = "passo_2";
    else if (seletorVisivel(documento, 'input[id="idSelecionarServico"]')) etapa = "passo_1";
    else if (Array.from(documento.querySelectorAll("button")).some(
      (botao) => estaVisivel(botao) && normalizar2(botao.innerText) === "novo requerimento"
    )) etapa = "lista_requerimentos";
    return {
      etapa,
      modal: modalContatos ? "contatos" : modalConfirmacao ? "confirmacao_final" : null
    };
  }
  function textoSeguro(valor) {
    return valor.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]").replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]").replace(/\b\d{10,13}\b/g, "[numero]").replace(/\s+/g, " ").trim().slice(0, 180);
  }
  function capturarDiagnosticoGerid(documento = document) {
    const estado = detectarEstadoGerid(documento);
    const campos = Array.from(
      documento.querySelectorAll("input, textarea, select")
    ).filter(estaVisivel).slice(0, 60).map((campo) => ({
      id: campo.id || campo.getAttribute("name") || "(sem id)",
      tipo: campo instanceof HTMLInputElement ? campo.type || "text" : campo.tagName.toLowerCase(),
      preenchido: campo instanceof HTMLInputElement && ["checkbox", "radio"].includes(campo.type) ? campo.checked : Boolean(campo.value)
    }));
    const alertas = Array.from(
      documento.querySelectorAll('[role="alert"], .br-message, .feedback')
    ).filter(estaVisivel).map((alerta) => textoSeguro(alerta.innerText)).filter(Boolean).slice(0, 10);
    const botoes = Array.from(documento.querySelectorAll("button")).filter(estaVisivel).map((botao) => ({
      texto: textoSeguro(botao.innerText || botao.getAttribute("aria-label") || ""),
      desabilitado: botao.disabled || botao.getAttribute("aria-disabled") === "true"
    })).filter((botao) => botao.texto).slice(0, 30);
    const anexos = Array.from(documento.querySelectorAll('.containerAnexo input[type="file"]')).filter(estaVisivel).map((input, indice) => ({
      indice,
      rotulo: textoSeguro(
        input.closest(".containerAnexo")?.querySelector("strong")?.innerText || input.closest(".containerAnexo")?.innerText || ""
      ),
      arquivo: Boolean(input.files?.length)
    }));
    return {
      ...estado,
      caminho: window.location.pathname,
      alertas,
      campos,
      botoes,
      anexos
    };
  }
  function listarPerguntasObrigatoriasPendentes(documento = document) {
    const compactar = (valor) => valor.replace(/\s+/g, " ").trim();
    return Array.from(documento.querySelectorAll('input[role="combobox"][id^="ca-"]')).filter((combo) => estaVisivel(combo) && !combo.value.trim()).map((combo) => {
      let pai = combo.parentElement;
      for (let nivel = 0; pai && nivel < 6; nivel++, pai = pai.parentElement) {
        const texto = compactar(pai.innerText || "");
        const pergunta = texto.split(/(?=Selecione o item|Exibir lista)/)[0]?.trim();
        if (pergunta && pergunta.length > 10 && pergunta.length < 500) {
          return pergunta.replace(/^\*\s*/, "");
        }
      }
      return combo.id;
    });
  }
  function resumirDiagnosticoGerid(diagnostico) {
    const alertas = diagnostico.alertas.length ? ` Alertas: ${diagnostico.alertas.join(" | ")}.` : "";
    const pendentes = diagnostico.campos.filter((campo) => !campo.preenchido).map((campo) => campo.id).slice(0, 12);
    return `Estado ${diagnostico.etapa}${diagnostico.modal ? `, modal ${diagnostico.modal}` : ""}.` + (pendentes.length ? ` Campos pendentes: ${pendentes.join(", ")}.` : "") + alertas;
  }
  var init_estadoGerid = __esm({
    "src/estadoGerid.ts"() {
      "use strict";
    }
  });

  // src/domain/motivos.ts
  var init_motivos = __esm({
    "src/domain/motivos.ts"() {
      "use strict";
    }
  });

  // src/domain/grupoFamiliar.ts
  function ehTitular(parentesco) {
    return ROTULOS_TITULAR.has(normalizarCabecalho(parentesco));
  }
  var ROTULOS_TITULAR;
  var init_grupoFamiliar = __esm({
    "src/domain/grupoFamiliar.ts"() {
      "use strict";
      init_motivos();
      init_texto();
      ROTULOS_TITULAR = /* @__PURE__ */ new Set([
        "titular",
        "requerente",
        "proprio",
        "propria",
        "o proprio",
        "a propria"
      ]);
    }
  });

  // src/regrasPreenchimento.ts
  function formaDeConvivio(grupo) {
    const moraSozinho = grupo.integrantes.length <= 1;
    return moraSozinho ? FORMA_CONVIVIO.sozinho : FORMA_CONVIVIO.comFamilia;
  }
  function estadoCivilGerid(valorPlanilha) {
    if (ESTADO_CIVIL_SEMPRE_PADRAO) return ESTADO_CIVIL_PADRAO;
    const chave = normalizar(valorPlanilha);
    if (!chave) return ESTADO_CIVIL_PADRAO;
    return ESTADOS_CIVIS_GERID[chave] ?? ESTADO_CIVIL_PADRAO;
  }
  function mapearParentesco(parentescoPlanilha) {
    if (ehTitular(parentescoPlanilha)) {
      const res2 = { grupo: "Requerente", confirmado: true };
      Object.defineProperty(res2, "exato", { value: true, enumerable: false, configurable: true });
      return res2;
    }
    const p = normalizar(parentescoPlanilha);
    for (const entrada of MAPA_PARENTESCO) {
      if (entrada.termos.some((t) => p.includes(t))) {
        const res2 = { grupo: entrada.grupo, confirmado: entrada.confirmado };
        Object.defineProperty(res2, "exato", { value: entrada.confirmado, enumerable: false, configurable: true });
        return res2;
      }
    }
    const res = { grupo: GRUPOS_PARENTESCO_GERID.outros, confirmado: false };
    Object.defineProperty(res, "exato", { value: false, enumerable: false, configurable: true });
    return res;
  }
  function slotGeridDoDocumento(tipo) {
    return SLOT_GERID_POR_TIPO[tipo] ?? null;
  }
  function indiceSlotDoDocumento(tipo) {
    const rotulo = slotGeridDoDocumento(tipo);
    if (!rotulo) return null;
    return SLOTS_GERID.find((s) => s.rotulo === rotulo)?.indice ?? null;
  }
  function extensaoAceita(nomeArquivo) {
    const ext = /\.[a-z0-9]+$/i.exec(nomeArquivo)?.[0]?.toLowerCase();
    return ext ? EXTENSOES_ACEITAS.includes(ext) : false;
  }
  var SERVICO_BPC_PCD, RESPOSTAS_FIXAS, PERGUNTAS_PASSO7, RESPOSTA_BOLSA_FAMILIA, FORMA_CONVIVIO, ESTADO_CIVIL_PADRAO, ESTADOS_CIVIS_GERID, ESTADO_CIVIL_SEMPRE_PADRAO, GRUPOS_PARENTESCO_GERID, MAPA_PARENTESCO, SLOTS_GERID, EXTENSOES_ACEITAS, SLOT_GERID_POR_TIPO;
  var init_regrasPreenchimento = __esm({
    "src/regrasPreenchimento.ts"() {
      "use strict";
      init_grupoFamiliar();
      init_texto();
      SERVICO_BPC_PCD = {
        id: "1655",
        rotulo: "Benef\xEDcio Assistencial \xE0 Pessoa com Defici\xEAncia"
      };
      RESPOSTAS_FIXAS = {
        /** Passo 5. "Gastos com a deficiência negados pelo poder público?" */
        comprometimentoDeRenda: "N\xE3o",
        /** Passo 6. "Proteção Especial SUAS (Centro-Dia) negada?" */
        protecaoEspecialSuas: "N\xE3o",
        /** Passo 7. Aceita acompanhar o andamento (Meu INSS / 135 / e-mail). */
        acompanhaProcesso: "Sim",
        /** Passo 7. "Você é estrangeiro em situação regular no Brasil?" */
        estrangeiro: "B) N\xE3o",
        /** Passo 7. "Deseja cadastrar Representante Legal para este pedido?" */
        representanteLegal: "N\xE3o",
        /** Passo 7. "Deseja cadastrar Procurador para este pedido?" (o advogado). */
        procurador: "Sim",
        /** Passo 7. "Onde você mora?" */
        ondeMora: "Moro em resid\xEAncia",
        /** Passo 7. "Recebe algum tipo de benefício?" — atenção ao espaço final. */
        recebeBeneficio: "C) N\xE3o",
        /** Passo 7. "...autoriza o INSS a alterar a data do pedido...?" */
        alterarDataPedido: "Sim",
        // --- Acordo Internacional ---
        quemAtendido: "O procurador do titular",
        resideBrasil: "A) Sim",
        // Padrão
        beneficioExclusivoExterior: "B) N\xE3o",
        condicaoDeficiencia: "B) N\xE3o",
        tempoRural: "B) N\xE3o",
        concederOutraAposentadoria: "A) Sim",
        cessacaoBeneficio: "A) Sim",
        pensaoPorMorte: "B) N\xE3o",
        // --- Acertos Perícia Médica ---
        procuradorRepresentanteLegal: "Sim",
        ajusteNovoAuxilio: "N\xE3o",
        motivoSolicitacao: "Outros",
        // Default fallback
        empregado: "N\xE3o",
        estadoCivil7: "Solteiro(a)",
        // Default, will probably need to map from caso.cliente.estadoCivil later if we want it perfect
        corRaca: "N\xE3o Informado",
        grauInstrucao: "N\xE3o Informado"
      };
      PERGUNTAS_PASSO7 = {
        estrangeiro: "Voc\xEA \xE9 estrangeiro em situa\xE7\xE3o regular no Brasil?",
        representanteLegal: "Deseja cadastrar Representante Legal para este pedido?",
        procurador: "Deseja cadastrar Procurador para este pedido?",
        ondeMora: "Onde voc\xEA mora?",
        formaConvivio: "Forma de Conv\xEDvio",
        recebeBeneficio: "Recebe algum tipo de benef\xEDcio?",
        alterarDataPedido: "autoriza o INSS a alterar a data do pedido para atender \xE0s condi\xE7\xF5es para o benef\xEDcio?",
        bolsaFamilia: "bolsa fam\xEDlia",
        ciencia: "Estou ciente de que devo acompanhar o pedido pelos canais de atendimento",
        apelido: "Conhecido por/Apelido",
        // --- Novas perguntas do fluxo Acordo Internacional ---
        quemAtendido: "Quem est\xE1 sendo atendido?",
        resideBrasil: "Voc\xEA reside no Brasil?",
        beneficioExclusivoExterior: "Voc\xEA quer benef\xEDcio exclusivo no exterior?",
        condicaoDeficiencia: "Trabalha ou trabalhou na condi\xE7\xE3o de pessoa com defici\xEAncia?",
        tempoRural: "Voc\xEA possui tempo rural?",
        concederOutraAposentadoria: "Caso n\xE3o tenha direito a este benef\xEDcio, autoriza o INSS a conceder outro tipo de aposentadoria",
        cessacaoBeneficio: "concorda com a cessa\xE7\xE3o do benef\xEDcio menos vantajoso",
        pensaoPorMorte: "Recebe pens\xE3o por morte deixada por c\xF4njuge/companheiro(a) em outro regime",
        // --- Novas perguntas do fluxo Acertos para Marcação de Perícia Médica ---
        procuradorRepresentanteLegal: "Voc\xEA \xE9 Procurador ou Representante Legal para este pedido?",
        ajusteNovoAuxilio: "Trata-se de ajuste para solicitar novo aux\xEDlio-doen\xE7a ou para prorrogar benef\xEDcio?",
        motivoSolicitacao: "Motivo da solicita\xE7\xE3o",
        empregado: "Trata-se de empregado?",
        estadoCivil7: "Estado Civil",
        corRaca: "Cor/Ra\xE7a",
        grauInstrucao: "Grau de Instru\xE7\xE3o"
      };
      RESPOSTA_BOLSA_FAMILIA = "N\xE3o h\xE1 recebimento de Bolsa Fam\xEDlia";
      FORMA_CONVIVIO = {
        comFamilia: "Com pessoas da fam\xEDlia",
        sozinho: "Sozinho(a)"
      };
      ESTADO_CIVIL_PADRAO = "Solteiro";
      ESTADOS_CIVIS_GERID = {
        solteiro: "Solteiro",
        casado: "Casado",
        viuvo: "Vi\xFAvo",
        divorciado: "Divorciado",
        separado: "Separado",
        // CORRIGIDO: existe opção própria (id 5)
        "uniao estavel": "Casado",
        amasiado: "Casado",
        concubinato: "Casado"
      };
      ESTADO_CIVIL_SEMPRE_PADRAO = true;
      GRUPOS_PARENTESCO_GERID = {
        paisPadrastos: "Pai / M\xE3e / Padrasto / Madrasta",
        irmaos: "Irm\xE3o / Irm\xE3",
        companheiro: "Companheiro (a)",
        conjuge: "C\xF4njuge",
        filhos: "Filho(a)",
        enteado: "Enteado",
        menorTutelado: "Menor Tutelado",
        outros: "Outros"
      };
      MAPA_PARENTESCO = [
        { termos: ["mae", "pai", "padrasto", "madrasta"], grupo: GRUPOS_PARENTESCO_GERID.paisPadrastos, confirmado: true },
        { termos: ["irmao", "irma"], grupo: GRUPOS_PARENTESCO_GERID.irmaos, confirmado: true },
        {
          termos: ["conjuge", "companheir", "esposa", "esposo", "marido"],
          grupo: GRUPOS_PARENTESCO_GERID.companheiro,
          confirmado: false
        },
        { termos: ["entead"], grupo: GRUPOS_PARENTESCO_GERID.enteado, confirmado: true },
        { termos: ["filho", "filha"], grupo: GRUPOS_PARENTESCO_GERID.filhos, confirmado: false },
        { termos: ["tutelad"], grupo: GRUPOS_PARENTESCO_GERID.menorTutelado, confirmado: true }
      ];
      SLOTS_GERID = [
        { indice: 0, rotulo: "Termo de representa\xE7\xE3o da entidade conveniada", obrigatorio: true },
        { indice: 1, rotulo: "Documento de identifica\xE7\xE3o do procurador (OAB/RG/CNH/CTPS)", obrigatorio: false },
        { indice: 2, rotulo: "Comprovante da representa\xE7\xE3o legal, se for o caso", obrigatorio: false },
        { indice: 3, rotulo: "Documentos de identifica\xE7\xE3o do representante legal, se for o caso", obrigatorio: false },
        { indice: 4, rotulo: "Documentos de identifica\xE7\xE3o do interessado", obrigatorio: true },
        { indice: 5, rotulo: "Documento de identifica\xE7\xE3o de todos os membros do grupo familiar", obrigatorio: false },
        { indice: 6, rotulo: "Comprovantes das rela\xE7\xF5es previdenci\xE1rias do interessado e do grupo familiar", obrigatorio: false },
        { indice: 7, rotulo: "Outros documentos", obrigatorio: false },
        { indice: 8, rotulo: "Documento M\xE9dico", obrigatorio: false },
        { indice: 9, rotulo: "Comprovante do cadastro biom\xE9trico do titular", obrigatorio: false },
        { indice: 10, rotulo: "Comprovante do cadastro biom\xE9trico do representante legal", obrigatorio: false }
      ];
      EXTENSOES_ACEITAS = [".pdf", ".png", ".jpg", ".jpeg", ".bmp"];
      SLOT_GERID_POR_TIPO = {
        TERMO_REPRESENTACAO: "Termo de representa\xE7\xE3o da entidade conveniada",
        OAB: "Documento de identifica\xE7\xE3o do procurador (OAB/RG/CNH/CTPS)",
        PROCURACAO: "Comprovante da representa\xE7\xE3o legal, se for o caso",
        DOCUMENTOS_PESSOAIS: "Documentos de identifica\xE7\xE3o do interessado",
        CADASTRO_UNICO: "Documento de identifica\xE7\xE3o de todos os membros do grupo familiar",
        DOCUMENTOS_MEDICOS: "Documento M\xE9dico"
      };
    }
  });

  // src/preencherGerid.ts
  async function executarEtapa(etapa, executar, relatarTempo) {
    const inicio = performance.now();
    try {
      return await executar();
    } finally {
      relatarTempo(etapa, Math.round(performance.now() - inicio));
    }
  }
  async function preencherRequerimento(page, caso, opcoes, relatarTempo = () => void 0) {
    const avisos = [];
    await executarEtapa("1 - servico", () => passo1SelecionarServico(page), relatarTempo);
    await executarEtapa("2 - requerente", () => passo2InformarRequerente(page, caso), relatarTempo);
    await executarEtapa("3 - CadUnico", () => passo3AutorizacaoCadUnico(page), relatarTempo);
    await executarEtapa("4 - grupo familiar", () => passo4GrupoFamiliar(page, caso, avisos), relatarTempo);
    await executarEtapa("5/6 - declaracoes", () => passo5e6Perguntas(page, avisos), relatarTempo);
    if (!await executarEtapa(
      "7 - dados e anexos",
      () => passo7DadosRequerente(page, caso, opcoes, avisos),
      relatarTempo
    )) {
      return { pronto: false, telaAtual: "Dados do Requerente", avisos };
    }
    if (!await executarEtapa(
      "8 - unidade",
      () => passo8SelecionarUnidade(page, caso, avisos),
      relatarTempo
    )) {
      return { pronto: false, telaAtual: "Selecionar Unidade", avisos };
    }
    if (!await executarEtapa(
      "9 - orgao pagador",
      () => passo9OrgaoPagador(page, caso, avisos),
      relatarTempo
    )) {
      return { pronto: false, telaAtual: "\xD3rg\xE3o Pagador", avisos };
    }
    await esperarTela(page, /Confirmar|Declaro que li/i);
    return { pronto: true, telaAtual: "Confirmar", avisos };
  }
  function visivel(loc) {
    return loc;
  }
  async function existeInputNoDom(loc) {
    return await loc.getAttribute("id").catch(() => null) !== null;
  }
  async function estaAnexado(loc) {
    const verificar = loc.isAttached;
    return verificar ? verificar.call(loc) : existeInputNoDom(loc);
  }
  async function contarAnexados(loc) {
    const contar = loc.countAttached;
    return contar ? contar.call(loc) : loc.count();
  }
  async function avancar(page, etapaAtual) {
    const antes = detectarEstadoGerid();
    if (antes.etapa !== etapaAtual) {
      const contexto2 = resumirDiagnosticoGerid(capturarDiagnosticoGerid());
      throw new ErroGerid(
        FalhaGerid.CAMPO_NAO_ENCONTRADO,
        `A extens\xE3o esperava ${etapaAtual}, mas o GERID estava em ${antes.etapa}. ${contexto2}`
      );
    }
    const botao = visivel(page.locator(NAVEGACAO.avancar)).first();
    const limite = Date.now() + 1e4;
    while (Date.now() < limite) {
      if (await botao.isEnabled().catch(() => false)) {
        await botao.click();
        const limiteMudanca = Date.now() + 1e4;
        while (Date.now() < limiteMudanca) {
          const depois = detectarEstadoGerid();
          if (depois.etapa !== etapaAtual && depois.etapa !== "desconhecido") {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const contexto = resumirDiagnosticoGerid(capturarDiagnosticoGerid());
    throw new ErroGerid(
      FalhaGerid.ERRO_PREENCHIMENTO,
      `O GERID n\xE3o saiu de ${etapaAtual} ap\xF3s validar os dados. ${contexto}`
    );
  }
  async function esperarTela(page, marca) {
    try {
      await visivel(page.getByText(marca)).first().waitFor({ state: "visible" });
    } catch {
      throw new ErroGerid(
        FalhaGerid.CAMPO_NAO_ENCONTRADO,
        `N\xE3o encontrei a tela esperada (${marca}). O layout do GERID pode ter mudado \u2014 revalidar o mapeamento.`
      );
    }
  }
  async function garantirMarcado(loc) {
    if (!await loc.isChecked().catch(() => false)) {
      await loc.check({ force: true });
    }
  }
  async function ativarOpcaoCombobox(opcao) {
    await opcao.click();
  }
  async function escolherNoCombobox(page, idCombobox, rotuloDesejado, aceitarTextoAdicional = false) {
    const idNoSeletor = idCombobox.match(/\[id="([^"]+)"\]/)?.[1];
    const id = idNoSeletor ?? idCombobox.replace(/^#/, "");
    const combo = page.locator(`[id="${id}"]`);
    if (!await combo.isVisible().catch(() => false)) return false;
    const alvo = normalizar(rotuloDesejado);
    const rotulos = page.locator(`[id="${id}-itens"] label`);
    let total = await rotulos.count().catch(() => 0);
    if (total === 0) {
      await combo.click().catch(() => void 0);
      const limite = Date.now() + 2e3;
      while (total === 0 && Date.now() < limite) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        total = await rotulos.count().catch(() => 0);
      }
    }
    for (let i = 0; i < total; i++) {
      const rotulo = rotulos.nth(i);
      const texto = await rotulo.innerText().catch(() => "");
      const textoNormalizado = normalizar(texto);
      if (textoNormalizado === alvo || aceitarTextoAdicional && textoNormalizado.includes(alvo)) {
        await ativarOpcaoCombobox(rotulo).catch(() => void 0);
        if (await aguardarValorCombobox(combo, alvo, 150)) return true;
        const rid = await rotulo.getAttribute("for");
        if (rid) {
          const radio = page.locator(`[id="${id}-itens"] input[id="${cssEscape(rid)}"]`).first();
          await radio.check({ force: true }).catch(() => void 0);
          if (await aguardarValorCombobox(combo, alvo, 2e3)) return true;
          if (await radio.isChecked().catch(() => false)) return true;
        }
        return false;
      }
    }
    return false;
  }
  async function aguardarValorCombobox(combo, valorEsperado, timeoutMs) {
    const limite = Date.now() + timeoutMs;
    while (Date.now() < limite) {
      if (normalizar(await combo.inputValue().catch(() => "")) === valorEsperado) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  }
  function cssEscape(valor) {
    return valor.replace(/["\\]/g, "\\$&");
  }
  async function comboPorPergunta(page, trechoPergunta) {
    return page.evaluate((trecho) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const alvo = norm(trecho);
      const combos = Array.from(
        document.querySelectorAll('[id^="ca-"]:not([id$="-itens"])')
      );
      for (const c of combos) {
        let p = c.parentElement;
        for (let h = 0; p && h < 6; h++, p = p.parentElement) {
          const texto = norm(p.innerText || "");
          if (texto.length > 10 && texto.length < 400 && texto.includes(alvo)) return c.id;
        }
      }
      return null;
    }, trechoPergunta);
  }
  async function inputPorPergunta(page, trechoPergunta) {
    return page.evaluate((trecho) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const alvo = norm(trecho);
      const inputs = Array.from(
        document.querySelectorAll(
          'input:not([role="combobox"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])'
        )
      );
      for (const input of inputs) {
        let p = input.parentElement;
        for (let h = 0; p && h < 5; h++, p = p.parentElement) {
          const texto = norm(p.innerText || "");
          if (texto.length > 3 && texto.length < 250 && texto.includes(alvo)) return input.id;
        }
      }
      return null;
    }, trechoPergunta);
  }
  async function responderPergunta(page, trechoPergunta, resposta, avisos, opcional = false) {
    const id = await comboPorPergunta(page, trechoPergunta);
    if (!id) {
      if (!opcional) {
        avisos.push(`N\xE3o encontrei a pergunta "${trechoPergunta}" \u2014 responda manualmente.`);
      }
      return;
    }
    const ok = await escolherNoCombobox(page, id, resposta);
    if (!ok) {
      avisos.push(
        `N\xE3o consegui marcar "${resposta}" em "${trechoPergunta}" \u2014 confira antes de concluir.`
      );
    }
  }
  async function passo1SelecionarServico(page) {
    await esperarTela(page, /Sele..o de Servi.os/i);
    const busca = visivel(page.locator(mapaGerid.passo1.campoBusca)).first();
    await busca.waitFor({ state: "visible" });
    const abrirLista = visivel(page.getByRole("button", { name: /^Exibir lista$/i })).first();
    if (await abrirLista.isVisible().catch(() => false)) await abrirLista.click();
    else await busca.click();
    const selecionou = await escolherNoCombobox(
      page,
      mapaGerid.passo1.campoBusca,
      SERVICO_BPC_PCD.rotulo,
      true
    );
    if (selecionou) {
      await avancar(page, "passo_1");
      return;
    }
    throw new ErroGerid(
      FalhaGerid.ERRO_PREENCHIMENTO,
      "O servi\xE7o BPC apareceu, mas o Gerid n\xE3o confirmou a sele\xE7\xE3o no campo Servi\xE7o."
    );
  }
  async function passo2InformarRequerente(page, caso) {
    const cpf = visivel(page.locator(mapaGerid.passo2.cpf)).first();
    await cpf.waitFor({ state: "visible" }).catch(() => {
      throw new ErroGerid(
        FalhaGerid.CAMPO_NAO_ENCONTRADO,
        "Campo de CPF do requerente n\xE3o apareceu no passo 2."
      );
    });
    await cpf.fill(apenasDigitos(caso.cliente.cpf));
    const botaoConsulta = visivel(
      page.getByRole("button", { name: /Bot.o de a..o/i })
    ).first();
    if (await botaoConsulta.isVisible().catch(() => false)) {
      await botaoConsulta.click();
    }
    const nome = visivel(page.locator(mapaGerid.passo2.nome)).first();
    const inicioEspera = Date.now();
    while (Date.now() - inicioEspera < 1e4) {
      if ((await nome.inputValue().catch(() => "")).trim()) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!(await nome.inputValue().catch(() => "")).trim()) {
      throw new ErroGerid(
        FalhaGerid.CAMPO_NAO_ENCONTRADO,
        "O Gerid n\xE3o retornou o nome do requerente ap\xF3s consultar o CPF."
      );
    }
    await avancar(page, "passo_2");
    await verificarBloqueioDePedidoAberto(page);
  }
  async function verificarBloqueioDePedidoAberto(page) {
    const alerta = page.locator('[role="alert"]');
    if (!await alerta.isVisible().catch(() => false)) return;
    const mensagem = await alerta.innerText().catch(() => "");
    if (/n..o e poss.vel continuar|pedido\s+\d+\s+.*em aberto/i.test(mensagem)) {
      throw new ErroGerid(
        FalhaGerid.ERRO_PREENCHIMENTO,
        `O GERID bloqueou este requerente por existir pedido em aberto. ${mensagem}`
      );
    }
  }
  async function passo3AutorizacaoCadUnico(page) {
    const check = visivel(page.locator(mapaGerid.passo3.autorizacaoCadUnico)).first();
    await check.waitFor({ state: "visible" }).catch(() => {
      throw new ErroGerid(
        FalhaGerid.CAMPO_NAO_ENCONTRADO,
        "Checkbox de autoriza\xE7\xE3o do Cad\xDAnico n\xE3o apareceu no passo 3."
      );
    });
    await garantirMarcado(check);
    await avancar(page, "passo_3");
  }
  async function passo4GrupoFamiliar(page, caso, avisos) {
    await esperarTela(page, /Grupo Familiar/i);
    await aguardarGrupoFamiliarEstavel(page, caso.grupoFamiliar.integrantes.length);
    const porCpf = /* @__PURE__ */ new Map();
    for (const i of caso.grupoFamiliar.integrantes) {
      const c = apenasDigitos(i.cpf ?? "");
      if (c) porCpf.set(c, i.parentesco ?? "");
    }
    const linhas = await page.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const out = [];
      for (let i = 0; i < 40; i++) {
        const ec = document.getElementById(`selectEstadoCivil${i}`);
        if (!ec) break;
        const tr = ec.closest("tr");
        const primeiraCelula = tr?.querySelector("td");
        const digitos = norm(primeiraCelula?.innerText || "").replace(/\D/g, "");
        const cpf = digitos.length === 10 ? digitos.padStart(11, "0") : digitos;
        const ehRequerente = !document.getElementById(`selectParentesco${i}`);
        out.push({ indice: i, cpf, ehRequerente });
      }
      return out;
    });
    if (linhas.length === 0) {
      avisos.push("O GERID n\xE3o listou nenhum integrante do grupo familiar \u2014 confira o Cad\xDAnico.");
    }
    const vistos = /* @__PURE__ */ new Set();
    for (const linha of linhas) {
      const ehRequerente = linha.ehRequerente;
      if (linha.cpf) vistos.add(linha.cpf);
      const parentescoPlanilha = linha.cpf ? porCpf.get(linha.cpf) ?? "" : "";
      const estadoCivil = estadoCivilGerid(void 0);
      const okEc = await escolherNoCombobox(
        page,
        mapaGerid.passo4.estadoCivil(linha.indice),
        estadoCivil
      );
      if (!okEc) {
        avisos.push(
          `Linha ${linha.indice + 1}: n\xE3o consegui marcar o estado civil "${estadoCivil}".`
        );
      }
      if (ehRequerente) continue;
      if (!linha.cpf) {
        avisos.push(
          `Linha ${linha.indice + 1}: n\xE3o consegui ler o CPF na tela \u2014 parentesco n\xE3o preenchido.`
        );
        continue;
      }
      if (!porCpf.has(linha.cpf)) {
        avisos.push(
          `CPF ${linha.cpf} veio do Cad\xDAnico mas n\xE3o est\xE1 na planilha \u2014 confira o parentesco.`
        );
      }
      const resolvido = mapearParentesco(parentescoPlanilha);
      const okP = await escolherNoCombobox(
        page,
        mapaGerid.passo4.parentesco(linha.indice),
        resolvido.grupo ?? ""
      );
      if (!okP) {
        avisos.push(
          `Linha ${linha.indice + 1}: n\xE3o achei a op\xE7\xE3o de parentesco "${resolvido.grupo}".`
        );
      } else if (!resolvido.exato) {
        avisos.push(
          `CPF ${linha.cpf}: parentesco "${parentescoPlanilha}" n\xE3o tem op\xE7\xE3o pr\xF3pria no GERID; marquei "Outros". Confira antes de concluir.`
        );
      }
    }
    for (const cpf of porCpf.keys()) {
      if (!vistos.has(cpf)) {
        avisos.push(`CPF ${cpf} est\xE1 na planilha mas o GERID n\xE3o listou \u2014 diverg\xEAncia com o Cad\xDAnico.`);
      }
    }
    const nao = visivel(page.locator(mapaGerid.passo4.incluirExcluirNao)).first();
    if (await existeInputNoDom(nao)) {
      await garantirMarcado(nao);
    } else {
      const alt = visivel(page.getByLabel(/^N.o$/i)).last();
      if (await existeInputNoDom(alt)) await garantirMarcado(alt);
      else avisos.push('N\xE3o achei a op\xE7\xE3o "N\xE3o" de incluir/excluir integrante \u2014 marque manualmente.');
    }
    await avancar(page, "passo_4");
  }
  async function aguardarGrupoFamiliarEstavel(page, totalEsperado) {
    const limite = Date.now() + 5e3;
    let assinaturaAnterior = "";
    let estavelDesde = 0;
    while (Date.now() < limite) {
      const atual = await page.evaluate(() => {
        const controles = Array.from(document.querySelectorAll('[id^="selectEstadoCivil"]'));
        return controles.map((controle) => {
          const linha = controle.closest("tr");
          const cpf = linha?.querySelector("td")?.innerText.replace(/\D/g, "") ?? "";
          return `${controle.id}:${cpf}`;
        }).join("|");
      });
      const totalAtual = atual ? atual.split("|").length : 0;
      if (atual !== assinaturaAnterior) {
        assinaturaAnterior = atual;
        estavelDesde = Date.now();
      }
      if (totalAtual >= Math.max(1, totalEsperado) && Date.now() - estavelDesde >= 250) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  async function passo5e6Perguntas(page, avisos) {
    await marcarNaoSimples(page, avisos, "Comprometimento de Renda");
    await avancar(page, "passo_5");
    await marcarNaoSimples(page, avisos, "Prote\xE7\xE3o Especial SUAS");
    await avancar(page, "passo_6");
  }
  async function marcarNaoSimples(page, avisos, tela) {
    const porId = visivel(page.locator('input[id$="-Nao"]')).last();
    if (await existeInputNoDom(porId)) {
      await garantirMarcado(porId);
      return;
    }
    const porRotulo = visivel(page.getByLabel(/^N.o$/i)).last();
    if (await existeInputNoDom(porRotulo)) {
      await garantirMarcado(porRotulo);
      return;
    }
    avisos.push(`${tela}: n\xE3o achei a op\xE7\xE3o "N\xE3o" \u2014 marque manualmente (a resposta \xE9 sempre N\xE3o).`);
  }
  async function passo7DadosRequerente(page, caso, opcoes, avisos) {
    await esperarTela(page, /Dados Adicionais|Interessados/i);
    const telefone = caso.cliente.telefone?.trim() || opcoes.telefonePadrao;
    const celularConfirmado = await adicionarContato(page, "Celular", telefone, avisos);
    const emailConfirmado = await adicionarContato(page, "E-mail", opcoes.emailEscritorio, avisos);
    if (!celularConfirmado || !emailConfirmado) return false;
    const acompanha = visivel(page.locator(mapaGerid.passo7.acompanharProcessoSim)).first();
    if (await existeInputNoDom(acompanha)) await garantirMarcado(acompanha);
    else {
      avisos.push('N\xE3o achei a op\xE7\xE3o "Sim" para acompanhar o processo \u2014 marque manualmente.');
      return false;
    }
    await responderPergunta(page, PERGUNTAS_PASSO7.estrangeiro, RESPOSTAS_FIXAS.estrangeiro, avisos);
    await responderPergunta(
      page,
      PERGUNTAS_PASSO7.representanteLegal,
      RESPOSTAS_FIXAS.representanteLegal,
      avisos
    );
    await responderPergunta(page, PERGUNTAS_PASSO7.procurador, RESPOSTAS_FIXAS.procurador, avisos);
    await responderPergunta(page, PERGUNTAS_PASSO7.ondeMora, RESPOSTAS_FIXAS.ondeMora, avisos);
    await responderPergunta(
      page,
      PERGUNTAS_PASSO7.formaConvivio,
      formaDeConvivio(caso.grupoFamiliar),
      avisos,
      true
    );
    await responderPergunta(
      page,
      PERGUNTAS_PASSO7.recebeBeneficio,
      RESPOSTAS_FIXAS.recebeBeneficio,
      avisos
    );
    await responderPergunta(
      page,
      PERGUNTAS_PASSO7.alterarDataPedido,
      RESPOSTAS_FIXAS.alterarDataPedido,
      avisos
    );
    await responderPergunta(page, PERGUNTAS_PASSO7.quemAtendido, RESPOSTAS_FIXAS.quemAtendido, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.resideBrasil, RESPOSTAS_FIXAS.resideBrasil, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.beneficioExclusivoExterior, RESPOSTAS_FIXAS.beneficioExclusivoExterior, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.condicaoDeficiencia, RESPOSTAS_FIXAS.condicaoDeficiencia, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.tempoRural, RESPOSTAS_FIXAS.tempoRural, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.concederOutraAposentadoria, RESPOSTAS_FIXAS.concederOutraAposentadoria, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.cessacaoBeneficio, RESPOSTAS_FIXAS.cessacaoBeneficio, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.pensaoPorMorte, RESPOSTAS_FIXAS.pensaoPorMorte, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.procuradorRepresentanteLegal, RESPOSTAS_FIXAS.procuradorRepresentanteLegal, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.ajusteNovoAuxilio, RESPOSTAS_FIXAS.ajusteNovoAuxilio, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.motivoSolicitacao, RESPOSTAS_FIXAS.motivoSolicitacao, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.empregado, RESPOSTAS_FIXAS.empregado, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.estadoCivil7, RESPOSTAS_FIXAS.estadoCivil7, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.corRaca, RESPOSTAS_FIXAS.corRaca, avisos, true);
    await responderPergunta(page, PERGUNTAS_PASSO7.grauInstrucao, RESPOSTAS_FIXAS.grauInstrucao, avisos, true);
    if (RESPOSTA_BOLSA_FAMILIA) {
      await responderPergunta(page, PERGUNTAS_PASSO7.bolsaFamilia, RESPOSTA_BOLSA_FAMILIA, avisos);
    } else {
      avisos.push(
        "Bolsa Fam\xEDlia: a pergunta tem 4 op\xE7\xF5es (n\xE3o Sim/N\xE3o) e o escrit\xF3rio ainda n\xE3o definiu a regra. Deixei em branco \u2014 responda antes de concluir."
      );
      return false;
    }
    const cpfProcId = await inputPorPergunta(page, "CPF do Procurador");
    if (cpfProcId) {
      const cpfProcurador = visivel(page.locator(`[id="${cssEscape(cpfProcId)}"]`)).first();
      await cpfProcurador.fill(apenasDigitos(opcoes.procuradorCpf));
      if (apenasDigitos(await cpfProcurador.inputValue().catch(() => "")) !== apenasDigitos(opcoes.procuradorCpf)) {
        avisos.push("O GERID n\xE3o confirmou o CPF do procurador \u2014 preencha manualmente.");
        return false;
      }
    } else {
      avisos.push('Campo "CPF do Procurador" n\xE3o encontrado \u2014 preencha manualmente.');
      return false;
    }
    const ciencias = visivel(page.locator('input[type="checkbox"][id^="campo-"]'));
    const totalCiencias = await contarAnexados(ciencias).catch(() => 0);
    for (let i = 0; i < totalCiencias; i++) {
      await garantirMarcado(ciencias.nth(i));
    }
    const perguntasPendentes = listarPerguntasObrigatoriasPendentes();
    if (perguntasPendentes.length) {
      avisos.push(
        `O GERID deixou ${perguntasPendentes.length} pergunta(s) obrigat\xF3ria(s) sem resposta: ` + perguntasPendentes.join(" | ")
      );
      return false;
    }
    await anexarDocumentos(page, opcoes, avisos);
    const slotsObrigatorios = SLOTS_GERID.filter((slot) => slot.obrigatorio);
    const anexosObrigatoriosAusentes = [];
    for (const slot of slotsObrigatorios) {
      const input = page.locator(mapaGerid.passo7.inputArquivo).nth(slot.indice);
      const quantidade = await input.evaluate((elemento) => elemento.files?.length ?? 0).catch(() => 0);
      if (quantidade === 0) anexosObrigatoriosAusentes.push(slot.rotulo);
    }
    if (anexosObrigatoriosAusentes.length) {
      avisos.push(`Anexos obrigat\xF3rios n\xE3o confirmados: ${anexosObrigatoriosAusentes.join(" | ")}`);
      return false;
    }
    await avancar(page, "passo_7");
    return true;
  }
  async function adicionarContato(page, tipo, valor, avisos) {
    if (!valor) {
      avisos.push(`Contato ${tipo} n\xE3o informado \u2014 adicione manualmente.`);
      return false;
    }
    try {
      const fechar = visivel(page.getByRole("button", { name: /^Fechar$/i })).first();
      if (!await fechar.isVisible().catch(() => false)) {
        const editar = visivel(
          page.getByRole("button", { name: /Clique para editar contatos/i })
        ).first();
        if (await editar.isVisible().catch(() => false)) await editar.click();
        else await visivel(page.getByText(/^Adicionar$/i)).first().click();
      }
      const jaExiste = await contatoExisteNoDialogo(page, tipo, valor);
      if (jaExiste) {
        await visivel(page.getByRole("button", { name: /Fechar/i })).first().click();
        return true;
      }
      const ok = await escolherNoCombobox(page, mapaGerid.passo7.tipoContato, tipo);
      if (!ok) throw new Error(`Tipo de contato "${tipo}" n\xE3o confirmado.`);
      await visivel(page.getByPlaceholder(/^Informe o /i)).first().fill(valor);
      await visivel(page.getByRole("button", { name: /^Adicionar$/i })).first().click();
      let confirmou = false;
      const limiteConfirmacao = Date.now() + 3e3;
      while (!confirmou && Date.now() < limiteConfirmacao) {
        confirmou = await contatoExisteNoDialogo(page, tipo, valor);
        if (!confirmou) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (!confirmou) throw new Error(`O GERID n\xE3o exibiu o contato ${tipo} depois de adicionar.`);
      await visivel(page.getByRole("button", { name: /Fechar/i })).first().click();
      return true;
    } catch {
      avisos.push(`Falhei ao adicionar o contato ${tipo} \u2014 adicione manualmente.`);
      return false;
    }
  }
  async function contatoExisteNoDialogo(page, tipo, valor) {
    return page.evaluate(({ tipoEsperado, valorEsperado }) => {
      const normalizarTexto = (entrada) => entrada.replace(/\s+/g, " ").trim().toLowerCase();
      const soDigitos = (entrada) => entrada.replace(/\D/g, "");
      const dialogo = document.querySelector("#selectTipoContato")?.closest('[role="dialog"]') ?? Array.from(document.querySelectorAll('[role="dialog"]')).find((elemento) => elemento.offsetParent !== null && /contatos/i.test(elemento.innerText));
      if (!dialogo) return false;
      return Array.from(dialogo.querySelectorAll("tbody tr")).some((linha) => {
        const texto = normalizarTexto(linha.innerText);
        const tipoOk = texto.includes(normalizarTexto(tipoEsperado));
        const valorOk = tipoEsperado.toLowerCase().includes("mail") ? texto.includes(normalizarTexto(valorEsperado)) : soDigitos(texto).includes(soDigitos(valorEsperado));
        return tipoOk && valorOk;
      });
    }, { tipoEsperado: tipo, valorEsperado: valor });
  }
  async function anexarDocumentos(page, opcoes, avisos) {
    const inputs = page.locator(mapaGerid.passo7.inputArquivo);
    const total = await inputs.count().catch(() => 0);
    if (total !== mapaGerid.passo7.totalSlots) {
      avisos.push(
        `Esperava ${mapaGerid.passo7.totalSlots} caixas de anexo e encontrei ${total} \u2014 o GERID pode ter mudado. Confira os anexos antes de concluir.`
      );
    }
    const porSlot = /* @__PURE__ */ new Map();
    for (const arq of opcoes.arquivos) {
      const slot = slotGeridDoDocumento(arq.tipo);
      if (!slot) {
        avisos.push(`Documento "${arq.tipo}" n\xE3o tem caixa mapeada no GERID \u2014 anexe manualmente.`);
        continue;
      }
      if (arq.nome && !extensaoAceita(arq.nome)) {
        avisos.push(
          `"${arq.nome}" tem extens\xE3o que o GERID n\xE3o aceita (s\xF3 .pdf .png .jpg .jpeg .bmp).`
        );
        continue;
      }
      const grupo = porSlot.get(slot) ?? [];
      grupo.push(arq);
      porSlot.set(slot, grupo);
    }
    for (const [slot, arquivos] of porSlot) {
      const indice = indiceSlotDoDocumento(arquivos[0]?.tipo ?? "");
      let alvo = null;
      const caixa = page.locator("div.containerAnexo").filter({ hasText: slot }).locator('input[type="file"]').first();
      if (await caixa.count()) alvo = caixa;
      if (!alvo && indice !== null && total === mapaGerid.passo7.totalSlots) {
        alvo = inputs.nth(indice);
        avisos.push(`Usei a posi\xE7\xE3o ${indice} para anexar "${slot}" \u2014 confira se caiu na caixa certa.`);
      }
      if (!alvo) {
        avisos.push(`Caixa "${slot}" n\xE3o encontrada \u2014 anexe os documentos manualmente.`);
        continue;
      }
      try {
        const conteudos = arquivos.map((arquivo) => arquivo.caminho);
        if (conteudos.some((conteudo) => typeof conteudo === "string")) {
          throw new Error("Conte\xFAdo do anexo n\xE3o foi recebido pela extens\xE3o.");
        }
        await alvo.setInputFiles(conteudos);
        const nomesRecebidos = await alvo.evaluate(
          (input) => Array.from(input.files ?? []).map((arquivo) => arquivo.name)
        );
        const nomesEsperados = arquivos.map((arquivo) => arquivo.nome).filter(Boolean);
        if (nomesRecebidos.length !== arquivos.length || nomesEsperados.some((nome) => !nomesRecebidos.includes(nome))) {
          throw new Error("O GERID n\xE3o preservou todos os arquivos selecionados.");
        }
      } catch {
        avisos.push(`Falha ao anexar ${arquivos.length} arquivo(s) em "${slot}" \u2014 anexe manualmente.`);
      }
    }
  }
  async function passo8SelecionarUnidade(page, caso, avisos) {
    await esperarTela(page, /Consultar por CEP|Selecionar Unidade/i);
    const cepPorRotulo = visivel(page.getByLabel(/^CEP$/i)).first();
    const cep = await cepPorRotulo.isVisible().catch(() => false) ? cepPorRotulo : visivel(page.getByPlaceholder(mapaGerid.passo8.cepPlaceholder)).first();
    if (!await cep.isVisible().catch(() => false)) {
      avisos.push("Campo de CEP n\xE3o encontrado no passo 8 \u2014 selecione a unidade manualmente.");
      return false;
    }
    await cep.fill(apenasDigitos(caso.cliente.cep));
    const digitado = apenasDigitos(await cep.inputValue().catch(() => ""));
    if (digitado !== apenasDigitos(caso.cliente.cep)) {
      avisos.push(`O CEP digitado n\xE3o bateu (esperado ${caso.cliente.cep}, ficou "${digitado}").`);
    }
    await visivel(page.getByRole("button", { name: /^Buscar$/i })).first().click();
    const ok = await selecionarUnidadeDeAtendimento(page, caso, avisos);
    if (ok) await avancar(page, "passo_8");
    return ok;
  }
  async function passo9OrgaoPagador(page, caso, avisos) {
    await esperarTela(page, /.rg.o Pagador|receber o benef.cio/i);
    const municipio = cidadeSemUf(caso.cliente.cidade);
    const selecionouMunicipio = await escolherNoCombobox(
      page,
      mapaGerid.passo9.municipio,
      municipio
    );
    if (!selecionouMunicipio) {
      avisos.push(`Nao encontrei o municipio "${municipio}" na lista de orgao pagador.`);
      return false;
    }
    const marcouAlvo = await marcarPrimeiroRadioDoOrgaoPagador(page);
    if (!marcouAlvo) {
      avisos.push(`Nenhum orgao pagador foi listado para o municipio "${municipio}".`);
      return false;
    }
    const primeiro = page.locator('[data-gerid-rpa-orgao="primeiro"]').first();
    await primeiro.waitFor({ state: "attached", timeout: 1e4 }).catch(() => void 0);
    if (!await estaAnexado(primeiro)) {
      avisos.push(`Nenhum orgao pagador foi listado para o municipio "${municipio}".`);
      return false;
    }
    const selecionou = await primeiro.check({ force: true }).then(() => primeiro.isChecked().catch(() => true), () => false);
    if (!selecionou) {
      avisos.push(`Nao consegui selecionar o primeiro orgao pagador de "${municipio}".`);
      return false;
    }
    await avancar(page, "passo_9");
    return true;
  }
  async function marcarPrimeiroRadioDoOrgaoPagador(page) {
    const limite = Date.now() + 1e4;
    while (Date.now() < limite) {
      const encontrou = await page.evaluate(() => {
        document.querySelectorAll("[data-gerid-rpa-orgao]").forEach((elemento) => {
          elemento.removeAttribute("data-gerid-rpa-orgao");
        });
        const municipio = document.querySelector("#orgaoPagadorMunicipio");
        let escopo = municipio?.parentElement ?? null;
        for (let nivel = 0; escopo && nivel < 10; nivel++, escopo = escopo.parentElement) {
          const radio = escopo.querySelector('table tbody input[type="radio"]');
          if (radio) {
            radio.setAttribute("data-gerid-rpa-orgao", "primeiro");
            return true;
          }
        }
        return false;
      });
      if (encontrou) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  }
  function cidadeSemUf(cidade) {
    return cidade.replace(/\s*[\/-]\s*[A-Za-z]{2}\s*$/u, "").trim();
  }
  async function selecionarUnidadeDeAtendimento(page, caso, avisos) {
    const unidades = page.locator(mapaGerid.passo8.cardUnidade);
    await unidades.first().waitFor({ state: "visible", timeout: 1e4 }).catch(() => void 0);
    const opcoes = await page.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      return Array.from(document.querySelectorAll(".unidade")).map((e, indice) => ({
        indice,
        nome: norm(e.querySelector(".nome")?.innerText || ""),
        cidade: norm(e.querySelector(".municipio")?.innerText || "")
      }));
    });
    if (opcoes.length === 0) {
      avisos.push("Nenhuma unidade de atendimento foi listada para o CEP informado.");
      return false;
    }
    const alvo = normalizar(cidadeSemUf(caso.cliente.cidade));
    const semUf = (cidade) => normalizar(cidade).replace(/\s*-\s*[a-z]{2}$/u, "").trim();
    const exata = opcoes.find((o) => semUf(o.cidade) === alvo);
    const escolhida = exata ?? opcoes[0];
    if (!escolhida) return false;
    if (!exata) {
      avisos.push(
        `O GERID nao listou unidade no municipio "${cidadeSemUf(caso.cliente.cidade)}"; foi usada a primeira unidade regional retornada (${escolhida.nome}).`
      );
    }
    const card = unidades.nth(escolhida.indice);
    await card.click().catch(() => void 0);
    let selecionou = false;
    const limiteSelecao = Date.now() + 3e3;
    while (!selecionou && Date.now() < limiteSelecao) {
      selecionou = (await card.getAttribute("class"))?.split(/\s+/).includes("selected") ?? false;
      if (!selecionou) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!selecionou) {
      avisos.push(`Nao consegui selecionar a unidade de atendimento "${escolhida.nome}".`);
      return false;
    }
    return true;
  }
  var init_preencherGerid = __esm({
    "src/preencherGerid.ts"() {
      "use strict";
      init_playwright_polyfill();
      init_tiposGerid();
      init_texto();
      init_mapaGerid();
      init_estadoGerid();
      init_regrasPreenchimento();
    }
  });

  // src/classificarPreenchimento.ts
  function classificarPreenchimento(resultado) {
    const avisos = resultado.avisos.filter(Boolean).join(" | ");
    if (!resultado.pronto || resultado.telaAtual !== "Confirmar") {
      return {
        status: "erro",
        erro: `O preenchimento parou em "${resultado.telaAtual}" antes da tela Confirmar.` + (avisos ? ` ${avisos}` : "")
      };
    }
    return {
      status: "revisao",
      erro: avisos || "Preenchido at\xE9 Confirmar. Revise os dados e conclua manualmente no Gerid."
    };
  }
  var init_classificarPreenchimento = __esm({
    "src/classificarPreenchimento.ts"() {
      "use strict";
    }
  });

  // src/detectarProtocolo.ts
  function detectarProtocoloEmTexto(texto) {
    const normalizado = String(texto || "").replace(/\s+/g, " ").trim();
    const padroes = [
      /(?:n[uú]mero\s+d[oe]\s+)?protocolo\s*(?:gerado)?\s*[:#-]?\s*([0-9][0-9.\/-]{7,30})/i,
      /(?:n[uú]mero\s+d[oe]\s+)?requerimento\s*[:#-]\s*([0-9][0-9.\/-]{7,30})/i,
      /(?:n[uú]mero\s+d[oe]\s+)?pedido\s*[:#-]\s*([0-9][0-9.\/-]{7,30})/i
    ];
    for (const padrao of padroes) {
      const encontrado = normalizado.match(padrao)?.[1];
      if (!encontrado) continue;
      const digitos = encontrado.replace(/\D/g, "");
      if (digitos.length >= 8 && digitos.length <= 25) return encontrado.replace(/[.,;:]+$/, "");
    }
    return null;
  }
  var init_detectarProtocolo = __esm({
    "src/detectarProtocolo.ts"() {
      "use strict";
    }
  });

  // src/index.ts
  var require_index = __commonJS({
    "src/index.ts"() {
      init_playwright_polyfill();
      init_preencherGerid();
      init_tiposGerid();
      init_mapaGerid();
      init_classificarPreenchimento();
      init_detectarProtocolo();
      init_estadoGerid();
      var CONTENT_BUILD_ID = "1.5.1-20260811.6";
      window.__GERID_RPA_CONTENT_BUILD__ = CONTENT_BUILD_ID;
      function logToBackground(message) {
        console.log(message);
        try {
          chrome.runtime.sendMessage({ action: "content_log", message }).catch(() => {
          });
        } catch (e) {
        }
      }
      function textoNormalizado(valor) {
        return (valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      }
      function selecionarOpcaoNativa(campo, localizar) {
        const opcao = Array.from(campo.options).find(localizar);
        if (!opcao) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        if (setter) setter.call(campo, opcao.value);
        else campo.value = opcao.value;
        campo.dispatchEvent(new Event("input", { bubbles: true }));
        campo.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      async function resolverBloqueiosConhecidosGerid() {
        const limite = Date.now() + 1e4;
        while (Date.now() < limite) {
          const textoPagina = textoNormalizado(document.body?.innerText);
          if (textoPagina.includes("login - pat") && textoPagina.includes("abrangencia")) {
            const selects = Array.from(document.querySelectorAll("select")).filter((campo) => campo.offsetParent !== null);
            const abrangencia = selects[0];
            const papel = selects[1];
            if (abrangencia && !abrangencia.value) {
              selecionarOpcaoNativa(abrangencia, (opcao) => Boolean(opcao.value));
              await new Promise((resolve) => setTimeout(resolve, 100));
              continue;
            }
            if (papel && textoNormalizado(papel.selectedOptions[0]?.text) !== "entidade_conveniada_oab") {
              const selecionou = selecionarOpcaoNativa(
                papel,
                (opcao) => textoNormalizado(opcao.text).includes("entidade_conveniada_oab")
              );
              if (!selecionou) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
              }
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            const autorizar = Array.from(document.querySelectorAll("button")).find((botao) => textoNormalizado(botao.innerText) === "autorizo");
            if (autorizar && !autorizar.disabled) {
              logToBackground("Autorizando abrangencia e papel no PAT...");
              autorizar.click();
              return { estado: "navegando", mensagem: "Autorizacao do PAT enviada." };
            }
          }
          if (textoPagina.includes("certificado digital do tipo a3")) {
            const ok = Array.from(document.querySelectorAll("button")).find((botao) => textoNormalizado(botao.innerText) === "ok");
            if (ok && !ok.disabled) {
              logToBackground("Confirmando o aviso de certificado A3...");
              ok.click();
              return { estado: "navegando", mensagem: "Aviso do certificado A3 confirmado." };
            }
          }
          const confirmacaoFinal = Array.from(document.querySelectorAll("button")).some((botao) => textoNormalizado(botao.innerText) === "confirmar");
          if (textoPagina.includes("atencao") && confirmacaoFinal) {
            return {
              estado: "revisao_manual",
              mensagem: "Confirmacao final preservada para revisao humana."
            };
          }
          if (/^\/(tarefas|requerimentos)(?:\/|$)/.test(window.location.pathname)) {
            return { estado: "livre", mensagem: "Portal do GERID pronto." };
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return {
          estado: "aguardando",
          mensagem: "O portal ainda aguarda uma etapa de autenticacao ou autorizacao."
        };
      }
      window.resolverBloqueiosGerid = resolverBloqueiosConhecidosGerid;
      window.obterEstadoGerid = () => detectarEstadoGerid();
      window.diagnosticarGerid = () => capturarDiagnosticoGerid();
      window.obterPendenciasGerid = () => listarPerguntasObrigatoriasPendentes();
      window.reiniciarRequerimentoGerid = async () => {
        if (detectarEstadoGerid().etapa === "passo_1") return true;
        const botaoPrimeiroPasso = Array.from(document.querySelectorAll("button")).find((botao) => {
          const texto = textoNormalizado(botao.innerText);
          return botao.offsetParent !== null && texto.includes("selecionar servico");
        });
        if (!botaoPrimeiroPasso) return false;
        botaoPrimeiroPasso.click();
        const limite = Date.now() + 5e3;
        while (Date.now() < limite) {
          if (detectarEstadoGerid().etapa === "passo_1") return true;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        return false;
      };
      async function abrirNovoRequerimentoSeNecessario(page) {
        const seletorServico = page.locator(mapaGerid.passo1.campoBusca);
        const novoRequerimento = page.getByRole("button", { name: /^Novo Requerimento$/i });
        const limite = Date.now() + 15e3;
        while (Date.now() < limite) {
          if (await seletorServico.isVisible().catch(() => false)) return;
          if (await novoRequerimento.isVisible().catch(() => false)) {
            logToBackground("Abrindo Novo Requerimento no Gerid...");
            await novoRequerimento.click();
            await seletorServico.waitFor({ state: "visible", timeout: 15e3 });
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw new Error(
          'N\xE3o encontrei a tela de servi\xE7os nem o bot\xE3o "Novo Requerimento". Abra a lista de requerimentos do Gerid e tente novamente.'
        );
      }
      window.iniciarProcessamento = async (caso) => {
        logToBackground(`[ROB\xD4 INICIADO] Processando caso: ${caso.nome}`);
        const page = new MockPage();
        try {
          if (!caso?.dados?.cliente || !caso?.dados?.grupoFamiliar || !caso?.configuracao) {
            throw new Error("A extens\xE3o n\xE3o recebeu os dados completos do caso. Atualize o painel e tente novamente.");
          }
          const opcoes = {
            procuradorCpf: caso.configuracao.procuradorCpf,
            telefonePadrao: caso.configuracao.telefonePadrao,
            emailEscritorio: caso.configuracao.emailEscritorio,
            arquivos: (caso.anexos || []).map((anexo) => ({
              tipo: anexo.tipo,
              nome: anexo.nome,
              caminho: anexo
            }))
          };
          await abrirNovoRequerimentoSeNecessario(page);
          const inicioPreenchimento = performance.now();
          const temposEtapas = [];
          const res = await preencherRequerimento(page, caso.dados, opcoes, (etapa, duracaoMs) => {
            temposEtapas.push({ etapa, duracaoMs });
            logToBackground(`[TEMPO] ${etapa}: ${(duracaoMs / 1e3).toFixed(1)}s`);
          });
          const duracaoTotalMs = Math.round(performance.now() - inicioPreenchimento);
          logToBackground(
            `[TEMPO] preenchimento total: ${(duracaoTotalMs / 1e3).toFixed(1)}s`
          );
          const resultado = classificarPreenchimento(res);
          if (resultado.status === "revisao") {
            logToBackground(`[ROB\xD4 FINALIZADO] Preenchido para revis\xE3o humana.`);
            return { ...resultado, metricas: { duracaoTotalMs, etapas: temposEtapas } };
          } else {
            logToBackground(`[ROB\xD4 FINALIZADO] Falha: ${resultado.erro}`);
            return { ...resultado, metricas: { duracaoTotalMs, etapas: temposEtapas } };
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : "Erro interno no rob\xF4";
          const diagnostico = capturarDiagnosticoGerid();
          const contexto = resumirDiagnosticoGerid(diagnostico);
          logToBackground(`[ROB\xD4 FINALIZADO com ERRO FATAL]: ${errorMsg} ${contexto}`);
          if (e instanceof ErroGerid) {
            return { status: "erro", erro: `${e.message} ${contexto}`, diagnostico };
          }
          return { status: "erro", erro: `${errorMsg} ${contexto}`, diagnostico };
        }
      };
      window.detectarProtocoloGerid = () => detectarProtocoloEmTexto(document.body?.innerText || "");
    }
  });
  require_index();
})();
