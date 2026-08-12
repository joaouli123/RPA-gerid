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
    if (elemento instanceof HTMLInputElement && elemento.type === "file") return true;
    if (!elemento.isConnected) return false;
    const estilo = window.getComputedStyle(elemento);
    if (estilo.display === "none" || estilo.visibility === "hidden" || estilo.visibility === "collapse") {
      return false;
    }
    return elemento.getClientRects().length > 0;
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
            if (el && estaInteragivel(el)) return el;
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
          const alvo = el instanceof HTMLLabelElement ? el.closest(".br-item") ?? el : el;
          clicarComoUsuario(alvo);
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
            const alvo = options?.name;
            if (alvo) {
              els = els.filter((e) => {
                const nome = (e.getAttribute("aria-label") || e.innerText || e.textContent || e.value || "").trim().replace(/\s+/g, " ");
                if (typeof alvo === "string") return nome.includes(alvo);
                alvo.lastIndex = 0;
                return alvo.test(nome);
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
          valorContato: "#valorContatoInteressado",
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
      elemento = elemento.closest(".containerAnexo") ?? elemento;
    }
    if (!elemento.isConnected) return false;
    const estilo = window.getComputedStyle(elemento);
    return estilo.display !== "none" && estilo.visibility !== "hidden" && estilo.visibility !== "collapse" && elemento.getClientRects().length > 0;
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
  function temControleDeRemocao(caixa) {
    if (!caixa) return false;
    return Array.from(caixa.querySelectorAll('button, a, [role="button"]')).some((controle) => {
      const texto = normalizar2([
        controle.getAttribute("aria-label"),
        controle.getAttribute("title"),
        controle.textContent
      ].join(" "));
      return texto.includes("excluir") || texto.includes("remover");
    });
  }
  function capturarDiagnosticoGerid(documento = document) {
    const estado = detectarEstadoGerid(documento);
    const respondidoNoPar = (campo) => {
      const par = /^(.+)-(sim|n[aã]o)$/i.exec(campo.id || "");
      if (!par) return false;
      return Array.from(documento.querySelectorAll(`[id^="${CSS.escape(par[1])}-"]`)).some((irmao) => irmao.checked);
    };
    const ehObrigatorio = (campo) => {
      if (campo.required || campo.getAttribute("aria-required") === "true") return true;
      const rotulos = [
        campo.id ? documento.querySelector(`label[for="${CSS.escape(campo.id)}"]`)?.textContent : "",
        campo.getAttribute("aria-label"),
        campo.closest("label")?.textContent
      ];
      return rotulos.some((rotulo) => (rotulo || "").trim().startsWith("*"));
    };
    const campos = Array.from(
      documento.querySelectorAll("input, textarea, select")
    ).filter((campo) => estaVisivel(campo) && campo.type !== "file").slice(0, 60).map((campo) => ({
      id: campo.id || campo.getAttribute("name") || "(sem id)",
      tipo: campo instanceof HTMLInputElement ? campo.type || "text" : campo.tagName.toLowerCase(),
      preenchido: campo instanceof HTMLInputElement && ["checkbox", "radio"].includes(campo.type) ? campo.checked || respondidoNoPar(campo) : Boolean(campo.value),
      obrigatorio: ehObrigatorio(campo)
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
      // ⚠️ `input.files` não diz se o anexo está lá. Quando o GERID assume o
      // arquivo ele ESVAZIA o input e passa a mostrar o nome com um botão de
      // excluir. Ler só o input reportava "11/11 sem arquivo" numa tela onde os
      // anexos tinham entrado — e isso já mandou a investigação para o lado
      // errado uma vez.
      arquivo: Boolean(input.files?.length) || temControleDeRemocao(input.closest(".containerAnexo"))
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
    const vazios = diagnostico.campos.filter((campo) => !campo.preenchido);
    const pendentes = vazios.filter((campo) => campo.obrigatorio).map((campo) => campo.id).slice(0, 12);
    const anexosVazios = diagnostico.anexos.filter((anexo) => !anexo.arquivo).length;
    return `Estado ${diagnostico.etapa}${diagnostico.modal ? `, modal ${diagnostico.modal}` : ""}.` + (pendentes.length ? ` Campos obrigat\xF3rios pendentes: ${pendentes.join(", ")}.` : "") + (anexosVazios ? ` Caixas de anexo sem arquivo: ${anexosVazios}/${diagnostico.anexos.length}.` : "") + alertas;
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
  var PROTOCOLAR_AUTOMATICAMENTE, SERVICO_BPC_PCD, RESPOSTAS_FIXAS, PERGUNTAS_PASSO7, RESPOSTA_BOLSA_FAMILIA, FORMA_CONVIVIO, ESTADO_CIVIL_PADRAO, ESTADOS_CIVIS_GERID, ESTADO_CIVIL_SEMPRE_PADRAO, GRUPOS_PARENTESCO_GERID, MAPA_PARENTESCO, SLOTS_GERID, EXTENSOES_ACEITAS, SLOT_GERID_POR_TIPO;
  var init_regrasPreenchimento = __esm({
    "src/regrasPreenchimento.ts"() {
      "use strict";
      init_grupoFamiliar();
      init_texto();
      PROTOCOLAR_AUTOMATICAMENTE = true;
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
        "uniao estavel": "Uni\xE3o Est\xE1vel",
        amasiado: "Uni\xE3o Est\xE1vel",
        concubinato: "Uni\xE3o Est\xE1vel"
      };
      ESTADO_CIVIL_SEMPRE_PADRAO = false;
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
        { termos: ["filho", "filha"], grupo: GRUPOS_PARENTESCO_GERID.filhos, confirmado: true },
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

  // src/detectarProtocolo.ts
  function campoDaTelaDeTarefa(doc, rotuloProcurado) {
    if (!doc.querySelector("#tarefas-container")) return "";
    const alvo = rotuloProcurado.trim().toLowerCase();
    for (const rotulo of Array.from(doc.querySelectorAll(".dtp-datagrid-label"))) {
      const nome = (rotulo.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (nome !== alvo) continue;
      const valor = rotulo.parentElement?.querySelector(".dtp-datagrid-value");
      const texto = (valor?.textContent || "").replace(/\s+/g, " ").trim();
      if (texto) return texto;
    }
    return "";
  }
  function protocoloNaTelaDeTarefa(doc) {
    const digitos = campoDaTelaDeTarefa(doc, "protocolo").replace(/\D/g, "");
    return digitos.length >= 8 && digitos.length <= 25 ? digitos : null;
  }
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

  // src/modaisDoEnvio.ts
  function norm(valor) {
    return (valor || "").replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(new RegExp("\\p{M}", "gu"), "");
  }
  function naTela(el) {
    if (!(el instanceof HTMLElement) || !el.isConnected) return false;
    const estilo = window.getComputedStyle(el);
    return estilo.display !== "none" && estilo.visibility !== "hidden" && el.getClientRects().length > 0;
  }
  function decidirModalDoEnvio(doc) {
    let algumDialogo = false;
    let naoReconhecido = "";
    const descrever = (recorte, rotulos) => `"${recorte}" [botoes: ${rotulos.length ? rotulos.join(" | ") : "nenhum com rotulo"}]`;
    for (const dialogo of Array.from(doc.querySelectorAll('[role="dialog"]'))) {
      if (!naTela(dialogo)) continue;
      algumDialogo = true;
      const texto = dialogo.innerText || dialogo.textContent || "";
      const t = norm(texto);
      const recorte = texto.trim().slice(0, 400);
      const botoes = Array.from(dialogo.querySelectorAll("button")).filter(naTela);
      const rotulos = botoes.map((b) => (b.innerText || "").trim()).filter(Boolean);
      const confirmar = botoes.find((botao) => norm(botao.innerText) === "confirmar");
      if (!confirmar) {
        naoReconhecido ||= descrever(recorte, rotulos);
        continue;
      }
      if (t.includes("atencao") && botoes.some((b) => norm(b.innerText) === "cancelar")) {
        return { tipo: "atencao", texto: recorte, algumDialogo, confirmar, naoReconhecido: "" };
      }
      if (t.includes("requerimento ainda nao foi finalizado")) {
        return { tipo: "agendamento", texto: recorte, algumDialogo, confirmar, naoReconhecido: "" };
      }
      const comRotulo = botoes.filter((botao) => norm(botao.innerText).length > 0);
      if (comRotulo.length === 1 && comRotulo[0] === confirmar) {
        return { tipo: "ciente", texto: recorte, algumDialogo, confirmar, naoReconhecido: "" };
      }
      naoReconhecido ||= descrever(recorte, rotulos);
    }
    return { tipo: "", texto: "", algumDialogo, confirmar: null, naoReconhecido };
  }
  var init_modaisDoEnvio = __esm({
    "src/modaisDoEnvio.ts"() {
      "use strict";
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
    const etapas = [
      {
        id: "1 - servico",
        marca: "passo_1",
        tela: "Selecionar Servi\xE7o",
        executar: () => passo1SelecionarServico(page)
      },
      {
        id: "2 - requerente",
        marca: "passo_2",
        tela: "Informar Requerente",
        executar: () => passo2InformarRequerente(page, caso)
      },
      {
        id: "3 - CadUnico",
        marca: "passo_3",
        tela: "Autoriza\xE7\xE3o Cad\xDAnico",
        executar: () => passo3AutorizacaoCadUnico(page)
      },
      {
        id: "4 - grupo familiar",
        marca: "passo_4",
        tela: "Grupo Familiar",
        executar: () => passo4GrupoFamiliar(page, caso, avisos)
      },
      // Uma função só responde às duas telas de perguntas (gastos e SUAS).
      {
        id: "5/6 - declaracoes",
        marca: "passo_5",
        ate: "passo_6",
        tela: "Declara\xE7\xF5es",
        executar: () => passo5e6Perguntas(page, avisos)
      },
      {
        id: "7 - dados e anexos",
        marca: "passo_7",
        tela: "Dados do Requerente",
        executar: () => passo7DadosRequerente(page, caso, opcoes, avisos)
      },
      // As etapas 8 e 9 usam os componentes reais do GERID: cards `.unidade` e
      // municipio + radio de orgao pagador. Se o portal mudar esses contratos, o
      // robo para na etapa afetada em vez de avancar com um campo vazio.
      {
        id: "8 - unidade",
        marca: "passo_8",
        tela: "Selecionar Unidade",
        executar: () => passo8SelecionarUnidade(page, caso, avisos)
      },
      {
        id: "9 - orgao pagador",
        marca: "passo_9",
        tela: "\xD3rg\xE3o Pagador",
        executar: () => passo9OrgaoPagador(page, caso, avisos)
      }
    ];
    for (const etapa of etapas) {
      const onde = posicaoEtapa(detectarEstadoGerid().etapa);
      if (onde > posicaoEtapa(etapa.ate ?? etapa.marca)) {
        avisos.push(`Etapa "${etapa.tela}" j\xE1 estava preenchida no GERID \u2014 retomei sem refazer.`);
        relatarTempo(`${etapa.id} (retomado)`, 0);
        continue;
      }
      const resultado = await executarEtapa(etapa.id, etapa.executar, relatarTempo);
      const jaAberto = pedidoJaEmAberto();
      if (jaAberto) {
        avisos.push(
          `O GERID recusou refazer: ja existe o pedido ${jaAberto} em aberto para este CPF. Nao protocolei de novo - este e o numero do requerimento que ja esta la.`
        );
        return { pronto: true, telaAtual: "Comprovante", avisos, protocolo: jaAberto };
      }
      if (resultado === false) {
        return { pronto: false, telaAtual: etapa.tela, avisos };
      }
    }
    if (detectarEstadoGerid().etapa !== "comprovante") {
      await esperarTela(page, /Confirmar|Declaro que li/i);
    }
    const concluido = await executarEtapa(
      "10 - confirmar e protocolar",
      () => passo10ConfirmarEProtocolar(page, avisos),
      relatarTempo
    );
    return {
      pronto: true,
      telaAtual: concluido.protocolo ? "Comprovante" : "Confirmar",
      avisos,
      ...concluido.protocolo ? { protocolo: concluido.protocolo } : {},
      ...concluido.comprovante ? { comprovante: concluido.comprovante } : {}
    };
  }
  function extrairPedidoEmAberto(bruto) {
    const texto = String(bruto || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return /pedido\s+(\d{6,})[^.]{0,40}?em aberto/i.exec(texto)?.[1] || "";
  }
  function vigiarPedidoEmAberto() {
    pedidoAbertoLembrado = "";
    observadorPedidoAberto?.disconnect();
    observadorPedidoAberto = null;
    if (typeof MutationObserver !== "function" || !document.body) return;
    observadorPedidoAberto = new MutationObserver((mutacoes) => {
      if (pedidoAbertoLembrado) return;
      for (const mutacao of mutacoes) {
        for (const no of Array.from(mutacao.addedNodes)) {
          const achado = extrairPedidoEmAberto(no.textContent || "");
          if (achado) {
            pedidoAbertoLembrado = achado;
            return;
          }
        }
      }
    });
    observadorPedidoAberto.observe(document.body, { childList: true, subtree: true });
  }
  function pedidoJaEmAberto() {
    const agora = extrairPedidoEmAberto(document.body?.innerText || "");
    if (agora) pedidoAbertoLembrado = agora;
    return pedidoAbertoLembrado;
  }
  function avisoInformativo(texto) {
    return `${MARCA_INFORMATIVO}${texto}`;
  }
  function avisosQueImpedemProtocolo(avisos) {
    return avisos.filter(
      (aviso) => !aviso.startsWith(MARCA_INFORMATIVO) && AVISO_PENDENTE.test(aviso)
    );
  }
  async function passo10ConfirmarEProtocolar(page, avisos) {
    const nada = { protocolo: "", comprovante: "" };
    const recusar = (motivo2) => {
      console.log(`[P10] NAO PROTOCOLEI: ${motivo2}`);
      avisos.push(motivo2);
      return nada;
    };
    if (detectarEstadoGerid().etapa === "comprovante") {
      const jaFeito = lerComprovante();
      if (jaFeito.protocolo) {
        console.log("[P10] comprovante ja estava na tela; nao confirmei de novo");
        return jaFeito;
      }
      return recusar("A tela do comprovante est\xE1 aberta, mas n\xE3o consegui ler o n\xFAmero do protocolo nela.");
    }
    if (!PROTOCOLAR_AUTOMATICAMENTE) {
      return recusar("Preenchimento conclu\xEDdo. O protocolo autom\xE1tico est\xE1 desligado \u2014 confira a tela e conclua.");
    }
    console.log(`[P10] avisos acumulados ate aqui (${avisos.length}):`, JSON.stringify(avisos, null, 1));
    const pendencias = avisosQueImpedemProtocolo(avisos);
    if (pendencias.length) {
      return recusar(
        `N\xC3O protocolei: ficou ${pendencias.length} pend\xEAncia(s) para resolver antes \u2014 ${pendencias.join(" | ")}`
      );
    }
    const reclamacoes = capturarDiagnosticoGerid().alertas.filter((alerta) => /obrigat|deve ser preenchid|necess[aá]ri|inv[aá]lid|erro|anexad|corrij|pendent/i.test(alerta));
    if (reclamacoes.length) {
      return recusar(`N\xC3O protocolei: o GERID est\xE1 reclamando na tela de confer\xEAncia \u2014 ${reclamacoes.join(" | ")}`);
    }
    const declaracao = visivel(page.locator(mapaGerid.passo10.declaracaoConfirmar)).first();
    await declaracao.waitFor({ state: "visible" }).catch(() => void 0);
    await garantirMarcado(declaracao).catch(() => void 0);
    if (!await declaracao.isChecked().catch(() => false)) {
      return recusar(
        'N\xE3o consegui marcar "Declaro que li e concordo com as informa\xE7\xF5es acima". Marque na tela e conclua.'
      );
    }
    console.log("[P10] declaracao marcada");
    const protocoloAntes = lerComprovante().protocolo;
    const avancarBotao = visivel(page.locator(NAVEGACAO.avancar)).first();
    const ateHabilitar = Date.now() + 1e4;
    while (Date.now() < ateHabilitar && !await avancarBotao.isEnabled().catch(() => false)) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await avancarBotao.click();
    console.log("[P10] avancar clicado; esperando o modal de confirmacao");
    const modais = await confirmarModaisDoEnvio(page);
    if (!modais.confirmou) {
      return recusar(
        modais.travou ? `Cliquei em Avan\xE7ar e o GERID abriu um modal que eu n\xE3o sei tratar: ${modais.travou}. Resolva na tela e me diga o que apareceu para eu passar a reconhecer.` : "Cliquei em Avan\xE7ar mas nenhum modal de confirma\xE7\xE3o apareceu. Confirme na tela."
      );
    }
    console.log("[P10] confirmado no modal");
    const limite = Date.now() + 6e4;
    while (Date.now() < limite) {
      const agora = lerComprovante();
      if (agora.protocolo && agora.protocolo !== protocoloAntes) return agora;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (modais.agendamento) {
      return recusar(
        'O GERID exigiu o agendamento antes de finalizar: "' + modais.agendamento + '". Confirmei o aviso, mas o n\xFAmero do protocolo n\xE3o saiu \u2014 o agendamento precisa ser feito na tela.'
      );
    }
    return recusar(
      "Confirmei o envio, mas o GERID n\xE3o mostrou o n\xFAmero do protocolo em 60s. " + (modais.ciente ? `O aviso que confirmei dizia: "${modais.ciente}". ` : "") + // Um modal que continuou na tela explica os 60s de espera inteiros. Antes
      // essa informação existia só dentro do laço e morria ali.
      (modais.travou ? `Ficou um modal que eu n\xE3o sei tratar: ${modais.travou}. ` : "") + "N\xC3O refa\xE7a o requerimento sem antes conferir na lista se ele j\xE1 foi protocolado."
    );
  }
  async function confirmarModaisDoEnvio(page) {
    const limite = Date.now() + 2e4;
    let confirmou = false;
    let agendamento = "";
    let ciente = "";
    let travou = "";
    while (Date.now() < limite) {
      const achado = await page.evaluate(() => {
        const decisao = decidirModalDoEnvio(document);
        if (decisao.tipo && decisao.confirmar) decisao.confirmar.click();
        return {
          tipo: decisao.tipo,
          texto: decisao.texto,
          algumDialogo: decisao.algumDialogo,
          naoReconhecido: decisao.naoReconhecido
        };
      });
      if (achado.naoReconhecido) travou = achado.naoReconhecido;
      if (achado.tipo === "atencao") confirmou = true;
      if (achado.tipo === "agendamento") {
        confirmou = true;
        agendamento = achado.texto;
      }
      if (achado.tipo === "ciente") {
        confirmou = true;
        ciente = achado.texto;
      }
      if (achado.tipo) console.log("[P10] modal confirmado:", achado.tipo, "\u2014", achado.texto);
      if (achado.naoReconhecido) console.log("[P10] modal NAO reconhecido:", achado.naoReconhecido);
      if (confirmou && !achado.tipo && !achado.algumDialogo) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return { confirmou, agendamento, ciente, travou };
  }
  function lerComprovante() {
    const texto = (document.body?.innerText || "").replace(/\u00a0/g, " ");
    return {
      // A tela de detalhe da tarefa vem primeiro porque ali o n\u00famero est\u00e1 num
      // campo rotulado \u2014 \u00e9 leitura exata, n\u00e3o reconhecimento de frase.
      protocolo: protocoloNaTelaDeTarefa(document) || detectarProtocoloEmTexto(texto) || "",
      // Recorta a partir do título "Comprovante" para não arquivar o menu do
      // portal junto; sem o título, guarda a tela toda em vez de perder o dado.
      comprovante: (texto.split(/^\s*Comprovante\s*$/m)[1] || texto).trim().slice(0, 8e3)
    };
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
    const id = await loc.getAttribute("id").catch(() => null);
    if (id && await acionarControleReactNaPagina("marcar", id)) {
      const limite = Date.now() + 1e3;
      while (Date.now() < limite) {
        if (await loc.isChecked().catch(() => false)) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    if (id && !await loc.isChecked().catch(() => false)) {
      const tag = document.getElementById(id)?.closest(".interaction-select");
      if (tag) {
        for (const tipo of ["mousedown", "mouseup", "click"]) {
          tag.dispatchEvent(new MouseEvent(tipo, {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            view: window
          }));
        }
        const limite = Date.now() + 1e3;
        while (Date.now() < limite) {
          if (await loc.isChecked().catch(() => false)) return;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
    }
    if (!await loc.isChecked().catch(() => false)) {
      await loc.check({ force: true });
    }
  }
  async function acionarControleReactNaPagina(tipo, id, valor) {
    if (acionarControleReactLocal(tipo, id, valor)) return true;
    try {
      const resposta = await chrome.runtime.sendMessage({
        action: "gerid_react_control",
        tipo,
        id,
        valor
      });
      return resposta?.ok === true;
    } catch {
    }
    return acionarControleReactViaEvento(tipo, id, valor);
  }
  async function acionarControleReactViaEvento(tipo, id, valor) {
    if (!document.documentElement.dataset.geridRpaControlBridge) return false;
    const canal = "__gerid_rpa_control__";
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      let encerrado = false;
      const finalizar = (resultado) => {
        if (encerrado) return;
        encerrado = true;
        window.removeEventListener("message", receberResposta);
        resolve(resultado);
      };
      const receberResposta = (evento) => {
        if (evento.source !== window || evento.data?.canal !== canal) return;
        if (evento.data?.tipoMensagem !== "resposta" || evento.data?.requestId !== requestId) return;
        finalizar(evento.data.resposta?.ok === true);
      };
      window.addEventListener("message", receberResposta);
      window.postMessage({
        canal,
        tipoMensagem: "solicitacao",
        requestId,
        tipoControle: tipo,
        id,
        valor
      }, "*");
      setTimeout(() => finalizar(false), 3e3);
    });
  }
  function acionarControleReactLocal(tipo, id, valor) {
    const obterPropsReact = (elemento) => {
      if (!elemento) return null;
      const nomes = Object.getOwnPropertyNames(elemento);
      const chaveProps = nomes.find((nome) => nome.startsWith("__reactProps$"));
      if (chaveProps) return elemento[chaveProps];
      const chaveFiber = nomes.find((nome) => nome.startsWith("__reactFiber$"));
      let fiber = chaveFiber ? elemento[chaveFiber] : null;
      for (let nivel = 0; fiber && nivel < 4; nivel++, fiber = fiber.return) {
        if (fiber.memoizedProps) return fiber.memoizedProps;
      }
      return null;
    };
    const criarEvento = (elemento, tipoEvento, value) => {
      let cancelado = false;
      return {
        type: tipoEvento,
        target: value === void 0 ? elemento : { value },
        currentTarget: elemento,
        nativeEvent: null,
        bubbles: true,
        cancelable: true,
        defaultPrevented: false,
        preventDefault() {
          cancelado = true;
        },
        stopPropagation() {
        },
        persist() {
        },
        isDefaultPrevented() {
          return cancelado;
        },
        isPropagationStopped() {
          return false;
        }
      };
    };
    const opcaoCorresponde = (item, alvo) => {
      const label = item.querySelector("label");
      const textos = [
        label?.querySelector('[aria-hidden="true"] > div')?.textContent,
        label?.querySelector("div")?.textContent,
        label?.getAttribute("aria-label"),
        label?.innerText,
        label?.textContent
      ].filter((texto) => Boolean(texto?.trim()));
      return textos.some((texto) => {
        const candidato = normalizar(texto);
        return candidato === alvo || candidato.startsWith(alvo);
      });
    };
    if (tipo === "combobox") {
      const combo = document.getElementById(id);
      const lista = document.getElementById(`${id}-itens`);
      const alvo = normalizar(valor ?? "");
      const item = Array.from(lista?.querySelectorAll(".br-item") ?? []).find((opcao) => opcaoCorresponde(opcao, alvo));
      if (!combo || !item) return false;
      const valorOpcao = item.querySelector('input[type="radio"]')?.value;
      const propsCombo = obterPropsReact(combo);
      if (valorOpcao && typeof propsCombo?.onChange === "function") {
        try {
          propsCombo.onChange(criarEvento(combo, "change", valorOpcao));
          return true;
        } catch {
        }
      }
      const props2 = obterPropsReact(item);
      if (typeof props2?.onMouseDown === "function") {
        props2.onMouseDown(criarEvento(item, "mousedown"));
        return true;
      }
      if (typeof props2?.onKeyDown === "function") {
        props2.onKeyDown({ ...criarEvento(item, "keydown"), key: "Enter" });
        return true;
      }
      return false;
    }
    const controle = document.getElementById(id)?.closest(".interaction-select");
    const props = obterPropsReact(controle ?? null);
    if (!controle || !props) return false;
    if (typeof props.onClick === "function") {
      props.onClick(criarEvento(controle, "click"));
      return true;
    }
    if (typeof props.onKeyDown === "function") {
      props.onKeyDown({ ...criarEvento(controle, "keydown"), key: "Enter" });
      return true;
    }
    return false;
  }
  async function ativarOpcaoCombobox(opcao) {
    await opcao.click();
  }
  function diagCombobox(id, alvo, motivo2) {
    const el = document.getElementById(id);
    const lista = document.getElementById(`${id}-itens`);
    const estilo = el ? window.getComputedStyle(el) : null;
    console.log(
      `[P4][combo] ${id} alvo="${alvo}" motivo=${motivo2} existe=${Boolean(el)} rects=${el?.getClientRects().length ?? -1} display=${estilo?.display} visibility=${estilo?.visibility} value="${el?.value ?? ""}" itens=${lista ? lista.querySelectorAll(".br-item").length : "sem-lista"}`
    );
  }
  function semSufixoDeGenero(texto) {
    return texto.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  }
  function jaTemValor(id, alvo) {
    const el = document.getElementById(id);
    const atual = normalizar(el?.value ?? "");
    if (!atual) return false;
    return atual === alvo || semSufixoDeGenero(atual) === semSufixoDeGenero(alvo);
  }
  async function escolherNoCombobox(page, idCombobox, rotuloDesejado, aceitarTextoAdicional = false) {
    const idNoSeletor = idCombobox.match(/\[id="([^"]+)"\]/)?.[1];
    const id = idNoSeletor ?? idCombobox.replace(/^#/, "");
    const combo = page.locator(`[id="${id}"]`);
    const alvo = normalizar(rotuloDesejado);
    if (!await combo.isVisible().catch(() => false)) {
      if (jaTemValor(id, alvo)) {
        diagCombobox(id, rotuloDesejado, "ok_ja_preenchido_em_etapa_anterior");
        return true;
      }
      diagCombobox(id, rotuloDesejado, "combo_nao_visivel");
      return false;
    }
    const rotulos = page.locator(`[id="${id}-itens"] label`);
    const limiteBusca = Date.now() + 12e3;
    let total = 0;
    let totalAnterior = -1;
    let estavel = 0;
    let ultimoClique = 0;
    for (; ; ) {
      total = await rotulos.count().catch(() => 0);
      const legiveis = await page.evaluate(
        (seletor) => Array.from(document.querySelectorAll(seletor)).filter((elemento) => (elemento.innerText || "").trim().length > 0).length,
        `[id="${id}-itens"] label`
      ).catch(() => 0);
      if ((legiveis === 0 || total <= 1) && Date.now() - ultimoClique > 2e3) {
        ultimoClique = Date.now();
        await combo.click().catch(() => void 0);
      }
      for (let i = 0; i < total; i++) {
        const rotulo = rotulos.nth(i);
        const texto = await rotulo.innerText().catch(() => "");
        const candidatos = [texto, ...texto.split("\n")].map((parte) => normalizar(parte)).filter(Boolean);
        const casou = candidatos.some((candidato) => candidato === alvo || aceitarTextoAdicional && candidato.includes(alvo));
        if (casou) {
          await ativarOpcaoCombobox(rotulo).catch(() => void 0);
          if (await aguardarValorCombobox(combo, alvo, 1e3)) {
            diagCombobox(id, rotuloDesejado, "ok_clique_no_item");
            return true;
          }
          const rid = await rotulo.getAttribute("for");
          if (rid) {
            const radio = page.locator(`[id="${id}-itens"] input[id="${cssEscape(rid)}"]`).first();
            await radio.check({ force: true }).catch(() => void 0);
            if (await aguardarValorCombobox(combo, alvo, 1e3)) {
              diagCombobox(id, rotuloDesejado, "ok_radio");
              return true;
            }
          }
          if (await acionarControleReactNaPagina("combobox", id, rotuloDesejado)) {
            if (await aguardarValorCombobox(combo, alvo, 1500)) {
              diagCombobox(id, rotuloDesejado, "ok_react_ultimo_recurso");
              return true;
            }
          }
          diagCombobox(id, rotuloDesejado, `opcao_achada_mas_valor_nao_grudou (for=${rid})`);
          return false;
        }
      }
      if (total > 1 && legiveis > 0 && total === totalAnterior && ++estavel >= 3) break;
      if (total !== totalAnterior) estavel = 0;
      totalAnterior = total;
      if (Date.now() >= limiteBusca) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    diagCombobox(id, rotuloDesejado, `nenhum_rotulo_casou (total=${total})`);
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
  async function campoPorPergunta(page, trechoPergunta, querCombobox, esperaMs = 2500) {
    const limite = Date.now() + esperaMs;
    for (; ; ) {
      const achado = await buscarCampoPorPergunta(page, trechoPergunta, querCombobox);
      if (achado || Date.now() >= limite) return achado;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  async function buscarCampoPorPergunta(page, trechoPergunta, querCombobox) {
    return page.evaluate(({ trecho, combobox }) => {
      const norm2 = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const ler = (el) => norm2(el.innerText || el.textContent || "");
      const alvo = norm2(trecho);
      if (!alvo) return null;
      const naoTexto = ["file", "checkbox", "radio", "hidden", "submit", "button"];
      const serve = (input) => combobox ? input.getAttribute("role") === "combobox" : input.getAttribute("role") !== "combobox" && !naoTexto.includes(input.type);
      for (const bloco of Array.from(document.querySelectorAll('[id^="div-ca-"]'))) {
        const rotulos = Array.from(bloco.querySelectorAll("label"));
        const casado = rotulos.find((rotulo) => ler(rotulo).includes(alvo));
        if (!casado) continue;
        const porFor = casado.getAttribute("for");
        const apontado = porFor ? document.getElementById(porFor) : null;
        if (apontado instanceof HTMLInputElement && serve(apontado)) return apontado.id;
        const input = Array.from(bloco.querySelectorAll("input")).find(serve);
        if (input?.id) return input.id;
      }
      for (const input of Array.from(document.querySelectorAll("input"))) {
        if (!input.id || !serve(input)) continue;
        let p = input.parentElement;
        for (let h = 0; p && h < 6; h++, p = p.parentElement) {
          const texto = ler(p);
          if (texto.length > 3 && texto.length < 400 && texto.includes(alvo)) return input.id;
        }
      }
      return null;
    }, { trecho: trechoPergunta, combobox: querCombobox });
  }
  async function esperarPerguntasEstaveis(page, esperaMs = 1e4) {
    const contar = () => page.evaluate(() => document.querySelectorAll('[id^="div-ca-"] input[role="combobox"]').length);
    const limite = Date.now() + esperaMs;
    let anterior = -1;
    let estavel = 0;
    let total = 0;
    for (; ; ) {
      total = await contar().catch(() => 0);
      if (total > 0 && total === anterior && ++estavel >= 3) break;
      if (total !== anterior) estavel = 0;
      anterior = total;
      if (Date.now() >= limite) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    console.log(`[P7] perguntas estaveis: ${total} combo(s)`);
    return total;
  }
  async function campoCpfProcurador(page, esperaMs = 8e3) {
    const procurar = async () => {
      for (const rotulo of ["CPF do Procurador", "CPF Procurador", "CPF do(a) Procurador"]) {
        const id = await inputPorPergunta(page, rotulo);
        if (id) return id;
      }
      const generico = await page.evaluate(() => {
        const norm2 = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const ler = (el) => norm2(el.innerText || el.textContent || "");
        const naoTexto = ["file", "checkbox", "radio", "hidden", "submit", "button"];
        const outroDono = ["requerente", "interessado", "titular", "representante legal"];
        for (const input of Array.from(document.querySelectorAll("input"))) {
          if (!input.id || input.disabled || input.getAttribute("role") === "combobox") continue;
          if (naoTexto.includes(input.type)) continue;
          const proprio = norm2([
            document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent || "",
            input.getAttribute("aria-label") || "",
            input.getAttribute("placeholder") || "",
            input.name || ""
          ].join(" "));
          if (!proprio.includes("cpf")) continue;
          if (outroDono.some((dono) => proprio.includes(dono))) continue;
          let bloco = input.parentElement;
          for (let altura = 0; bloco && altura < 6; altura++, bloco = bloco.parentElement) {
            if (ler(bloco).includes("procurador")) return input.id;
          }
        }
        return null;
      });
      if (generico) return generico;
      return page.evaluate(() => {
        const norm2 = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const ler = (el) => el ? norm2(el.innerText || el.textContent || "") : "";
        const naoTexto = ["file", "checkbox", "radio", "hidden", "submit", "button"];
        const identidade = (input) => norm2([
          document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent || "",
          input.getAttribute("aria-label") || "",
          input.getAttribute("placeholder") || "",
          input.name || ""
        ].join(" "));
        for (const bloco of Array.from(document.querySelectorAll('[id^="div-ca-"]'))) {
          if (!ler(bloco.querySelector("label")).includes("procurador")) continue;
          const candidatos = Array.from(bloco.querySelectorAll("input")).filter((input) => input.id && !input.disabled && !input.readOnly && input.getAttribute("role") !== "combobox" && !naoTexto.includes(input.type) && input.getClientRects().length > 0);
          const porNome = candidatos.find((input) => identidade(input).includes("cpf"));
          if (porNome) return porNome.id;
          if (candidatos.length === 1 && ler(bloco).includes("cpf")) return candidatos[0].id;
        }
        return null;
      });
    };
    const limite = Date.now() + esperaMs;
    for (; ; ) {
      const id = await procurar();
      if (id) return id;
      if (Date.now() >= limite) return null;
      await new Promise((resolva) => setTimeout(resolva, 250));
    }
  }
  async function pistasDoProcurador(page) {
    return page.evaluate(() => {
      const norm2 = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const ler = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      const pistas = /* @__PURE__ */ new Set();
      for (const bloco of Array.from(document.querySelectorAll('[id^="div-ca-"]'))) {
        const rotulo = bloco.querySelector("label");
        if (!rotulo || !norm2(ler(rotulo)).includes("deseja cadastrar procurador")) continue;
        const campos = Array.from(bloco.querySelectorAll("input"));
        const combo = campos.find((c) => c.getAttribute("role") === "combobox");
        pistas.add(`resposta atual: "${combo?.value || "(vazio)"}"`);
        pistas.add(`campos no bloco da pergunta: ${campos.length}`);
        for (const campo of campos) {
          if (campo === combo) continue;
          const marca = campo.id ? document.querySelector(`label[for="${CSS.escape(campo.id)}"]`) : null;
          const rotulo2 = marca ? ler(marca) : campo.getAttribute("aria-label") || campo.getAttribute("placeholder") || "";
          pistas.add(
            `campo ${campo.type || "text"}${campo.getClientRects().length ? "" : " OCULTO"}${campo.maxLength > 0 ? ` max=${campo.maxLength}` : ""} "${rotulo2.slice(0, 40)}" ${campo.value ? "preenchido" : "vazio"}`
          );
        }
        for (const rotulo2 of Array.from(bloco.querySelectorAll("label")).slice(1)) {
          pistas.add(`rotulo interno: "${ler(rotulo2).slice(0, 60)}"`);
        }
        console.log("[P7] bloco do procurador:", bloco.outerHTML.slice(0, 4e3));
      }
      for (const bloco of Array.from(document.querySelectorAll('[id^="div-ca-"]'))) {
        const naoTexto = ["file", "checkbox", "radio", "hidden", "submit", "button"];
        const vazio = Array.from(bloco.querySelectorAll("input")).some((campo) => campo.getAttribute("role") !== "combobox" && !naoTexto.includes(campo.type) && !campo.value);
        if (!vazio) continue;
        pistas.add(`vazio em: "${ler(bloco.querySelector("label") || bloco).slice(0, 50)}"`);
      }
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (el.children.length > 2 || el.getClientRects().length === 0) continue;
        const texto = ler(el);
        if (!texto || texto.length > 90 || !norm2(texto).includes("procurador")) continue;
        pistas.add(`${el.tagName.toLowerCase()}: "${texto.slice(0, 70)}"`);
      }
      const acoes = 'button, a[role="button"], .br-button, [aria-label]';
      for (const el of Array.from(document.querySelectorAll(acoes))) {
        if (el.getClientRects().length === 0) continue;
        const nome = (ler(el) || el.getAttribute("aria-label") || "").trim();
        if (!nome || nome.length > 60) continue;
        if (/adicionar|incluir|novo|buscar|pesquisar|vincular|interessad/i.test(nome)) {
          pistas.add(`acao: "${nome.slice(0, 50)}"`);
        }
      }
      return Array.from(pistas).slice(0, 14);
    });
  }
  async function fecharAvisosSobrepostos(page) {
    return page.evaluate(() => {
      const norm2 = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const fechados = [];
      for (const modal of Array.from(document.querySelectorAll('[role="dialog"]'))) {
        if (modal.getClientRects().length === 0) continue;
        const texto = norm2(modal.innerText || modal.textContent || "");
        if (texto.includes("tipo de contato") || texto.includes("contatos")) continue;
        const conhecido = texto.includes("deseja visualizar esta tarefa") || texto.includes("cpf do requerente");
        if (!conhecido) continue;
        const fechar = Array.from(modal.querySelectorAll("button")).find((botao) => norm2(botao.innerText || botao.textContent || "") === "fechar");
        if (!fechar) continue;
        fechar.click();
        fechados.push(texto.slice(0, 120));
      }
      return fechados;
    });
  }
  async function responderPergunta(page, trechoPergunta, resposta, avisos, opcional = false) {
    const id = await comboPorPergunta(page, trechoPergunta, opcional ? 400 : 2500);
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
    verificarBloqueioDePedidoAberto();
  }
  function verificarBloqueioDePedidoAberto() {
    const numero = pedidoJaEmAberto();
    if (!numero) return;
    throw new ErroGerid(
      FalhaGerid.ERRO_PREENCHIMENTO,
      `O GERID bloqueou este requerente: o pedido ${numero} ainda esta em aberto. Nao refiz o requerimento.`
    );
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
      if (c) porCpf.set(c, i);
    }
    const cpfRequerente = apenasDigitos(caso.grupoFamiliar.requerenteCpf ?? caso.cliente.cpf);
    const titularPlanilha = porCpf.get(cpfRequerente) ?? caso.grupoFamiliar.integrantes.find(
      (i) => ["titular", "requerente"].includes(normalizar(i.parentesco ?? ""))
    );
    const linhas = await lerLinhasGrupoFamiliar(page);
    console.log(
      `[P4] linhas detectadas=${linhas.length} ${JSON.stringify(linhas)} | integrantes na planilha=${caso.grupoFamiliar.integrantes.length}`
    );
    if (linhas.length === 0) {
      avisos.push("O GERID n\xE3o listou nenhum integrante do grupo familiar \u2014 confira o Cad\xDAnico.");
    }
    const falhas = [];
    const vistos = /* @__PURE__ */ new Set();
    for (const linha of linhas) {
      const ehRequerente = linha.ehRequerente;
      if (linha.cpf) vistos.add(linha.cpf);
      const integrantePlanilha = (linha.cpf ? porCpf.get(linha.cpf) : void 0) ?? (ehRequerente ? titularPlanilha : void 0);
      const parentescoPlanilha = integrantePlanilha?.parentesco ?? "";
      const estadoCivil = estadoCivilGerid(integrantePlanilha?.estadoCivil);
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
      if (!integrantePlanilha) {
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
        const decisao = resolvido.grupo === "Outros" ? 'n\xE3o tem op\xE7\xE3o pr\xF3pria no GERID; marquei "Outros"' : `foi interpretado como "${resolvido.grupo}"`;
        avisos.push(`CPF ${linha.cpf}: parentesco "${parentescoPlanilha}" ${decisao}. Confira antes de concluir.`);
      }
    }
    await aguardarGrupoFamiliarEstavel(page, caso.grupoFamiliar.integrantes.length);
    const linhasFinais = await lerLinhasGrupoFamiliar(page);
    if (linhasFinais.length !== linhas.length) {
      avisos.push(
        `O GERID mudou a tabela do grupo familiar durante o preenchimento (${linhas.length} -> ${linhasFinais.length} linhas). Confira antes de concluir.`
      );
    }
    const valorNaTela = (id) => document.getElementById(id)?.value.trim() ?? null;
    for (const linha of linhasFinais) {
      const integrante = (linha.cpf ? porCpf.get(linha.cpf) : void 0) ?? (linha.ehRequerente ? titularPlanilha : void 0);
      if (valorNaTela(`selectEstadoCivil${linha.indice}`) === "") {
        const alvo = estadoCivilGerid(integrante?.estadoCivil);
        if (!await escolherNoCombobox(page, mapaGerid.passo4.estadoCivil(linha.indice), alvo)) {
          falhas.push(`selectEstadoCivil${linha.indice} ("${alvo}")`);
        }
      }
      if (valorNaTela(`selectParentesco${linha.indice}`) === "") {
        const alvo = mapearParentesco(integrante?.parentesco ?? "").grupo ?? "";
        if (!await escolherNoCombobox(page, mapaGerid.passo4.parentesco(linha.indice), alvo)) {
          falhas.push(`selectParentesco${linha.indice} ("${alvo}")`);
        }
      }
    }
    console.log(
      `[P4] confer\xEAncia final: ${linhasFinais.length} linha(s) ${JSON.stringify(linhasFinais)}`
    );
    for (const cpf of porCpf.keys()) {
      if (!vistos.has(cpf)) {
        avisos.push(`CPF ${cpf} est\xE1 na planilha mas o GERID n\xE3o listou \u2014 diverg\xEAncia com o Cad\xDAnico.`);
      }
    }
    const limiteNao = Date.now() + 1e4;
    while (Date.now() < limiteNao && !document.getElementById("undefined-Nao")) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const estaMarcado = () => Boolean(
      document.getElementById("undefined-Nao")?.checked
    );
    let naoMarcado = estaMarcado();
    for (let tentativa = 0; tentativa < 3 && !naoMarcado; tentativa++) {
      const nao = visivel(page.locator(mapaGerid.passo4.incluirExcluirNao)).first();
      if (await existeInputNoDom(nao)) {
        await garantirMarcado(nao);
      } else {
        const alt = visivel(page.getByLabel(/^N.o$/i)).last();
        if (await existeInputNoDom(alt)) {
          await garantirMarcado(alt);
        } else {
          avisos.push('N\xE3o achei a op\xE7\xE3o "N\xE3o" de incluir/excluir integrante \u2014 marque manualmente.');
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
      naoMarcado = estaMarcado();
      console.log(`[P4] incluir/excluir "N\xE3o" tentativa=${tentativa} marcado=${naoMarcado}`);
    }
    console.log(`[P4] incluir/excluir "N\xE3o" marcado=${naoMarcado} | falhas=${JSON.stringify(falhas)}`);
    if (!naoMarcado) falhas.push('undefined-Nao (incluir/excluir = "N\xE3o")');
    if (falhas.length > 0) {
      throw new ErroGerid(
        FalhaGerid.ERRO_PREENCHIMENTO,
        `N\xE3o consegui preencher no Grupo Familiar: ${falhas.join(", ")}. Os valores existem na tela, ent\xE3o \xE9 falha de acionamento \u2014 veja as linhas [P4] no console.`
      );
    }
    await avancar(page, "passo_4");
  }
  function lerLinhasGrupoFamiliar(page) {
    return page.evaluate(() => {
      const norm2 = (s) => (s || "").replace(/\s+/g, " ").trim();
      const out = [];
      for (let i = 0; i < 40; i++) {
        const ec = document.getElementById(`selectEstadoCivil${i}`);
        if (!ec) break;
        const tr = ec.closest("tr");
        const primeiraCelula = tr?.querySelector("td");
        const digitos = norm2(primeiraCelula?.innerText || "").replace(/\D/g, "");
        const cpf = digitos.length === 10 ? digitos.padStart(11, "0") : digitos;
        const ehRequerente = !document.getElementById(`selectParentesco${i}`);
        out.push({ indice: i, cpf, ehRequerente });
      }
      return out;
    });
  }
  function assinaturaGrupoFamiliar(page) {
    return page.evaluate(() => {
      const combos = Array.from(
        document.querySelectorAll('input[id^="selectEstadoCivil"]')
      ).filter((combo) => /^selectEstadoCivil\d+$/.test(combo.id));
      return combos.map((combo) => {
        const linha = combo.closest("tr");
        const cpf = linha?.querySelector("td")?.innerText.replace(/\D/g, "") ?? "";
        const indice = combo.id.replace("selectEstadoCivil", "");
        const temParentesco = Boolean(document.getElementById(`selectParentesco${indice}`));
        return `${combo.id}:${cpf}:${temParentesco ? "p" : "-"}`;
      }).join("|");
    });
  }
  async function aguardarGrupoFamiliarEstavel(page, totalEsperado) {
    const limite = Date.now() + 2e4;
    let assinaturaAnterior = "";
    let estavelDesde = Date.now();
    while (Date.now() < limite) {
      const atual = await assinaturaGrupoFamiliar(page);
      const totalAtual = atual ? atual.split("|").length : 0;
      if (atual !== assinaturaAnterior) {
        assinaturaAnterior = atual;
        estavelDesde = Date.now();
      }
      const parado = Date.now() - estavelDesde;
      const completa = totalAtual >= Math.max(1, totalEsperado);
      if (totalAtual > 0 && parado >= (completa ? 700 : 3e3)) {
        console.log(`[P4] tabela est\xE1vel: ${totalAtual} linha(s) | ${atual}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    console.log(
      `[P4] tabela N\xC3O estabilizou em 20s. \xDAltima leitura: ${assinaturaAnterior || "(vazia)"}`
    );
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
    for (const fechado of await fecharAvisosSobrepostos(page)) {
      console.log(`[P7] aviso sobreposto fechado: ${fechado}`);
    }
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
    await fecharAvisosSobrepostos(page);
    await esperarPerguntasEstaveis(page);
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
    let cpfProcId = await campoCpfProcurador(page);
    if (!cpfProcId) {
      const idPergunta = await comboPorPergunta(page, "Deseja cadastrar Procurador");
      const antes = idPergunta ? await visivel(page.locator(`[id="${cssEscape(idPergunta)}"]`)).first().inputValue().catch(() => "") : "";
      if (antes.trim()) {
        console.log("[P7] campo do CPF nao montado; repetindo a resposta", JSON.stringify(antes));
        await escolherNoCombobox(page, idPergunta, antes.trim()).catch(() => false);
        const depois = await visivel(page.locator(`[id="${cssEscape(idPergunta)}"]`)).first().inputValue().catch(() => "");
        if (!depois.trim()) {
          avisos.push(`A pergunta "Deseja cadastrar Procurador para este pedido?" ficou em branco \u2014 responda "${antes.trim()}" na tela.`);
        }
        cpfProcId = await campoCpfProcurador(page, 4e3);
      }
    }
    let cpfProcuradorPendente = "";
    const preencherCpfProcurador = async (id) => {
      const campo = visivel(page.locator(`[id="${cssEscape(id)}"]`)).first();
      await campo.fill(apenasDigitos(opcoes.procuradorCpf));
      return apenasDigitos(await campo.inputValue().catch(() => "")) === apenasDigitos(opcoes.procuradorCpf) ? "" : "o GERID n\xE3o aceitou o CPF do procurador que digitei";
    };
    if (cpfProcId) {
      cpfProcuradorPendente = await preencherCpfProcurador(cpfProcId);
      console.log("[P7] CPF do procurador preenchido em", cpfProcId);
    }
    const ciencias = visivel(page.locator('input[type="checkbox"][id^="campo-"]'));
    const totalCiencias = await contarAnexados(ciencias).catch(() => 0);
    for (let i = 0; i < totalCiencias; i++) {
      await garantirMarcado(ciencias.nth(i));
    }
    const anexosConfirmados = await anexarDocumentos(page, opcoes, avisos);
    const anexosObrigatoriosAusentes = SLOTS_GERID.filter((slot) => slot.obrigatorio && !anexosConfirmados.has(slot.rotulo)).map((slot) => slot.rotulo);
    if (!cpfProcId) {
      cpfProcId = await campoCpfProcurador(page, 15e3);
      if (cpfProcId) {
        cpfProcuradorPendente = await preencherCpfProcurador(cpfProcId);
        console.log("[P7] CPF do procurador so apareceu depois dos anexos:", cpfProcId);
      } else {
        const pistas = await pistasDoProcurador(page).catch(() => []);
        console.log("[P7] campo do CPF do procurador nao encontrado. Na tela:", pistas);
        cpfProcuradorPendente = 'n\xE3o achei o campo "CPF do Procurador" na tela' + (pistas.length ? ` (o que h\xE1 nela: ${pistas.slice(0, 10).join(" \xB7 ")})` : "");
      }
    }
    const bloqueios = [];
    if (cpfProcuradorPendente) bloqueios.push(cpfProcuradorPendente);
    const perguntasPendentes = listarPerguntasObrigatoriasPendentes();
    if (perguntasPendentes.length) {
      bloqueios.push(`${perguntasPendentes.length} pergunta(s) obrigat\xF3ria(s): ${perguntasPendentes.join(" | ")}`);
    }
    if (anexosObrigatoriosAusentes.length) {
      bloqueios.push(`anexo(s) obrigat\xF3rio(s): ${anexosObrigatoriosAusentes.join(" | ")}`);
    }
    if (bloqueios.length) {
      avisos.push(
        `Preenchi e anexei o resto do passo 7. Falta ${bloqueios.join(" e ")} \u2014 complete na tela e clique em Avan\xE7ar.`
      );
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
    let operacao = "abrir a janela de contatos";
    try {
      const tipoContato = visivel(page.locator(mapaGerid.passo7.tipoContato)).first();
      if (!await tipoContato.isVisible().catch(() => false)) {
        const editar = visivel(page.locator(
          '[aria-label^="Clique para editar contatos do interessado"]'
        )).first();
        await editar.click();
        await tipoContato.waitFor({ state: "visible", timeout: 3e3 });
      }
      operacao = "consultar os contatos existentes";
      const jaExiste = await contatoExisteNoDialogo(page, tipo, valor);
      if (jaExiste) {
        operacao = "fechar a janela de contatos";
        if (!await clicarBotaoContatos(page, "Fechar")) {
          throw new Error("bot\xE3o Fechar n\xE3o encontrado dentro da janela");
        }
        return true;
      }
      operacao = `selecionar o tipo ${tipo}`;
      const ok = await escolherNoCombobox(page, mapaGerid.passo7.tipoContato, tipo);
      if (!ok) throw new Error(`Tipo de contato "${tipo}" n\xE3o confirmado.`);
      operacao = `preencher o valor de ${tipo}`;
      const campoValor = visivel(page.locator(mapaGerid.passo7.valorContato)).first();
      await campoValor.waitFor({ state: "visible", timeout: 3e3 });
      const seletorValor = mapaGerid.passo7.valorContato;
      const limiteHabilitar = Date.now() + 4e3;
      let habilitado = false;
      while (!habilitado && Date.now() < limiteHabilitar) {
        habilitado = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          return Boolean(el) && !el.disabled && !el.readOnly;
        }, seletorValor);
        if (!habilitado) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!habilitado) {
        throw new Error(
          `o campo Valor continuou bloqueado \u2014 o GERID n\xE3o registrou o tipo "${tipo}" no combobox (o texto apareceu, mas a sele\xE7\xE3o n\xE3o).`
        );
      }
      let escreveu = false;
      for (let tentativa = 0; tentativa < 4 && !escreveu; tentativa++) {
        await campoValor.fill(valor);
        await new Promise((resolve) => setTimeout(resolve, 300));
        escreveu = (await campoValor.inputValue().catch(() => "")).trim() !== "";
        console.log(`[P7] valor ${tipo} tentativa=${tentativa} sobreviveu=${escreveu}`);
      }
      if (!escreveu) {
        throw new Error(
          `o valor n\xE3o ficou no campo \u2014 o React do GERID apagou "${valor}" logo depois de escrito.`
        );
      }
      operacao = `adicionar o contato ${tipo}`;
      const limiteBotao = Date.now() + 2e3;
      let adicionou = false;
      while (!adicionou && Date.now() < limiteBotao) {
        adicionou = await clicarBotaoContatos(page, "Adicionar");
        if (!adicionou) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (!adicionou) throw new Error("bot\xE3o Adicionar n\xE3o ficou dispon\xEDvel dentro da janela");
      operacao = `confirmar o contato ${tipo} na tabela`;
      let confirmou = false;
      const limiteConfirmacao = Date.now() + 3e3;
      while (!confirmou && Date.now() < limiteConfirmacao) {
        confirmou = await contatoExisteNoDialogo(page, tipo, valor);
        if (!confirmou) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (!confirmou) {
        const reclamacao = await mensagensDoDialogoContatos(page);
        throw new Error(
          `O GERID n\xE3o exibiu o contato ${tipo} depois de adicionar.` + (reclamacao ? ` Ele reclamou: "${reclamacao}".` : "")
        );
      }
      operacao = "fechar a janela de contatos";
      if (!await clicarBotaoContatos(page, "Fechar")) {
        throw new Error("bot\xE3o Fechar n\xE3o encontrado dentro da janela");
      }
      return true;
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      avisos.push(`Falhei ao adicionar o contato ${tipo} em "${operacao}": ${detalhe}`);
      return false;
    }
  }
  async function clicarBotaoContatos(page, rotulo) {
    return page.evaluate(({ textoBotao }) => {
      const normalizarTexto = (entrada) => entrada.replace(/\s+/g, " ").trim().toLowerCase();
      const raiz = document.querySelector("#contatos");
      if (!raiz) return false;
      const botao = Array.from(
        raiz.querySelectorAll('button, [role="button"]')
      ).find((elemento) => {
        const estilo = window.getComputedStyle(elemento);
        const desabilitado = elemento.disabled || elemento.getAttribute("aria-disabled") === "true";
        const nome = elemento.getAttribute("aria-label") || elemento.innerText || elemento.textContent || "";
        return !desabilitado && elemento.getClientRects().length > 0 && estilo.display !== "none" && estilo.visibility !== "hidden" && normalizarTexto(nome) === normalizarTexto(textoBotao);
      });
      if (!botao) return false;
      botao.click();
      return true;
    }, { textoBotao: rotulo });
  }
  async function mensagensDoDialogoContatos(page) {
    return page.evaluate(() => {
      const seletores = [
        ".feedback",
        ".br-message",
        '[role="alert"]',
        ".invalid-feedback",
        ".text-danger",
        ".is-invalid ~ .feedback",
        ".error, .erro"
      ].join(", ");
      const visivel2 = (el) => el.getClientRects().length > 0;
      const limpar = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      const pareceReclamacao = (texto) => {
        const t = texto.toLowerCase();
        if (!t || t.length > 300) return false;
        if (/mb\b|kb\b|megabyte|extens|formato aceito|comprobat/.test(t)) return false;
        return /obrigat|inval|inv[aá]lid|deve ser|n[aã]o foi poss|n[aã]o p[oô]de|erro|falh|preench|j[aá] (existe|cadastrad)|duplicad|permitid/.test(t);
      };
      const modais = Array.from(
        document.querySelectorAll('#contatos, .br-modal, [role="dialog"]')
      ).filter(visivel2);
      const colher = (raizes) => {
        const vistos = /* @__PURE__ */ new Set();
        for (const raiz of raizes) {
          for (const el of Array.from(raiz.querySelectorAll(seletores))) {
            if (!visivel2(el)) continue;
            const texto = limpar(el);
            if (pareceReclamacao(texto)) vistos.add(texto);
          }
        }
        return Array.from(vistos).slice(0, 3).join(" | ");
      };
      return colher(modais) || colher([document.body]);
    });
  }
  async function contatoExisteNoDialogo(page, tipo, valor) {
    return page.evaluate(({ tipoEsperado, valorEsperado }) => {
      const soAlfanumerico = (entrada) => (entrada || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const soDigitos = (entrada) => (entrada || "").replace(/\D/g, "");
      const familias = [
        ["celular", "telefonecelular", "movel", "telefonemovel"],
        ["email", "correioeletronico", "eletronico"],
        ["telefonecomercial", "comercial", "telefonetrabalho"],
        ["telefoneresidencial", "residencial", "fixo", "telefone"]
      ];
      const familiaDe = (chave) => familias.find((f) => f.includes(chave));
      const tipoChave = soAlfanumerico(tipoEsperado);
      const apelidos = familiaDe(tipoChave) ?? [tipoChave];
      const ehEmail = valorEsperado.includes("@") || tipoChave.includes("mail");
      const digitosEsperados = soDigitos(valorEsperado);
      const fim = digitosEsperados.slice(-8);
      const emailEsperado = soAlfanumerico(valorEsperado);
      const bate = (bruto) => {
        const chave = soAlfanumerico(bruto);
        const tipoOk = apelidos.some((apelido) => chave.includes(apelido));
        if (!tipoOk) return false;
        if (ehEmail) return chave.includes(emailEsperado);
        const digitos = soDigitos(bruto);
        return Boolean(fim) && digitos.includes(fim);
      };
      const raizes = [
        document.querySelector("#contatos"),
        ...Array.from(document.querySelectorAll('.br-modal, [role="dialog"]')),
        document.body
      ].filter((el) => Boolean(el));
      for (const raiz of raizes) {
        const linhas = Array.from(raiz.querySelectorAll("tbody tr, tr, li"));
        if (linhas.some((linha) => bate(linha.innerText || linha.textContent || ""))) return true;
      }
      return false;
    }, { tipoEsperado: tipo, valorEsperado: valor });
  }
  async function entregarAnexo(alvo, pacote) {
    const compactar = (texto) => (texto || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const nomes = pacote.map((arquivo) => arquivo.nome).filter(Boolean);
    const lerCaixa = async () => await alvo.evaluate((elemento) => {
      const caixa = elemento.closest(".containerAnexo");
      if (!caixa) return { texto: "", remocao: false };
      const remocao = Array.from(caixa.querySelectorAll('button, a, [role="button"]')).some((controle) => {
        if (!controle.getClientRects().length) return false;
        const rotulo = [
          controle.getAttribute("aria-label"),
          controle.getAttribute("title"),
          controle.textContent
        ].join(" ").toLowerCase();
        return rotulo.includes("excluir") || rotulo.includes("remover");
      });
      return { texto: caixa.textContent || "", remocao };
    }).catch(() => ({ texto: "", remocao: false }));
    const inicial = await lerCaixa();
    const antes = compactar(inicial.texto);
    if (inicial.remocao) return { registrado: true, via: "ja-estava", detalhe: "" };
    const assinaturas = nomes.map((nome) => compactar(nome).toLowerCase().slice(0, 12)).filter(Boolean);
    const uteis = assinaturas.filter((assinatura) => !antes.toLowerCase().includes(assinatura));
    const soONovo = (agora) => (agora.startsWith(antes) ? agora.slice(antes.length) : agora).trim();
    const conferir = async () => {
      const limite = Date.now() + 2500;
      let novidade = "";
      while (Date.now() < limite) {
        const agora = await lerCaixa();
        novidade = soONovo(compactar(agora.texto));
        const confere = agora.remocao || (uteis.length ? uteis.every((assinatura) => novidade.toLowerCase().includes(assinatura)) : Boolean(novidade));
        if (confere) return { mudou: true, confere: true, novidade };
        await new Promise((resolva) => setTimeout(resolva, 150));
      }
      return { mudou: Boolean(novidade), confere: false, novidade };
    };
    await alvo.setInputFiles(pacote);
    let veredito = await conferir();
    if (veredito.confere) return { registrado: true, via: "change", detalhe: "" };
    if (!veredito.mudou) {
      await alvo.evaluate((elemento) => {
        const input = elemento;
        const transferencia = new DataTransfer();
        for (const arquivo of Array.from(input.files ?? [])) transferencia.items.add(arquivo);
        const area = input.closest(".br-upload") ?? input.closest(".containerAnexo") ?? input.parentElement;
        if (!area) return;
        for (const tipo of ["dragenter", "dragover", "drop"]) {
          area.dispatchEvent(new DragEvent(tipo, { bubbles: true, cancelable: true, dataTransfer: transferencia }));
        }
      }).catch(() => void 0);
      veredito = await conferir();
      if (veredito.confere) return { registrado: true, via: "drop", detalhe: "" };
    }
    const forma = await alvo.evaluate((elemento) => {
      const input = elemento;
      const caixa = input.closest(".containerAnexo");
      return `${input.files?.length ?? 0}/${caixa ? caixa.querySelectorAll('input[type="file"]').length : 0}`;
    }).catch(() => "?/?");
    return {
      registrado: false,
      via: veredito.mudou ? "mudou-sem-confirmar" : "nenhum",
      detalhe: `files/inputs=${forma}; caixa diz: "${veredito.novidade.replace(/\d{3,}/g, "###").slice(0, 160)}"`
    };
  }
  async function anexarDocumentos(page, opcoes, avisos) {
    const confirmados = /* @__PURE__ */ new Set();
    const inputs = page.locator(mapaGerid.passo7.inputArquivo);
    const total = await inputs.count().catch(() => 0);
    if (total !== mapaGerid.passo7.totalSlots) {
      avisos.push(avisoInformativo(
        `Esperava ${mapaGerid.passo7.totalSlots} caixas de anexo e encontrei ${total} \u2014 o GERID pode ter mudado. Confira os anexos antes de concluir.`
      ));
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
        const pacote = conteudos;
        const entrega = await entregarAnexo(alvo, pacote);
        console.log(`[P7] anexo "${slot}": ${entrega.registrado ? `ok via ${entrega.via}` : `NAO registrou \u2014 ${entrega.detalhe}`}`);
        if (entrega.registrado) {
          confirmados.add(slot);
        } else {
          avisos.push(
            `O GERID n\xE3o registrou ${arquivos.length} arquivo(s) em "${slot}" \u2014 anexe manualmente. (${entrega.detalhe})`
          );
        }
      } catch {
        avisos.push(`Falha ao anexar ${arquivos.length} arquivo(s) em "${slot}" \u2014 anexe manualmente.`);
      }
    }
    return confirmados;
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
      const norm2 = (s) => (s || "").replace(/\s+/g, " ").trim();
      return Array.from(document.querySelectorAll(".unidade")).map((e, indice) => ({
        indice,
        nome: norm2(e.querySelector(".nome")?.innerText || ""),
        cidade: norm2(e.querySelector(".municipio")?.innerText || "")
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
  var ORDEM_ETAPAS, posicaoEtapa, AVISO_PENDENTE, pedidoAbertoLembrado, observadorPedidoAberto, MARCA_INFORMATIVO, comboPorPergunta, inputPorPergunta;
  var init_preencherGerid = __esm({
    "src/preencherGerid.ts"() {
      "use strict";
      init_playwright_polyfill();
      init_tiposGerid();
      init_texto();
      init_mapaGerid();
      init_estadoGerid();
      init_regrasPreenchimento();
      init_detectarProtocolo();
      init_modaisDoEnvio();
      ORDEM_ETAPAS = [
        "passo_1",
        "passo_2",
        "passo_3",
        "passo_4",
        "passo_5",
        "passo_6",
        "passo_7",
        "passo_8",
        "passo_9",
        "passo_10",
        // `comprovante` fecha a lista para que uma tela JÁ protocolada conte como
        // "depois de tudo". Fora da lista ela valia -1, e -1 não é "passou de"
        // nenhuma etapa: o robô recomeçaria do passo 1 em cima de um requerimento
        // que já tinha número de protocolo.
        "comprovante"
      ];
      posicaoEtapa = (etapa) => ORDEM_ETAPAS.indexOf(etapa);
      AVISO_PENDENTE = /\b(falta|faltou|faltando|n[aã]o consegui|n[aã]o achei|n[aã]o encontrei|complete|preencha|responda|confira|revis|em branco|pendente|manual)/i;
      pedidoAbertoLembrado = "";
      observadorPedidoAberto = null;
      MARCA_INFORMATIVO = "\u2139\uFE0F ";
      comboPorPergunta = (page, trechoPergunta, esperaMs) => campoPorPergunta(page, trechoPergunta, true, esperaMs);
      inputPorPergunta = (page, trechoPergunta) => campoPorPergunta(page, trechoPergunta, false);
    }
  });

  // src/classificarPreenchimento.ts
  function classificarPreenchimento(resultado) {
    const avisos = resultado.avisos.filter(Boolean).join(" | ");
    const protocolo = (resultado.protocolo || "").trim();
    if (protocolo) {
      return {
        status: "sucesso",
        erro: avisos,
        protocolo,
        ...resultado.comprovante ? { comprovante: resultado.comprovante } : {}
      };
    }
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

  // src/index.ts
  var require_index = __commonJS({
    "src/index.ts"() {
      init_playwright_polyfill();
      init_preencherGerid();
      init_tiposGerid();
      init_mapaGerid();
      init_classificarPreenchimento();
      init_detectarProtocolo();
      init_modaisDoEnvio();
      init_estadoGerid();
      var CONTENT_BUILD_ID = "1.6.0-20260812.29";
      var EVENTO_LOG_GERID = "__gerid_rpa_log__";
      var CANAL_CONTROLE_GERID = "__gerid_rpa_control__";
      var emContextoExtensao = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
      window.__GERID_RPA_CONTENT_BUILD__ = CONTENT_BUILD_ID;
      console.log(
        `[GERID RPA BUILD] ${CONTENT_BUILD_ID} carregado no contexto ${emContextoExtensao ? "extensao" : "pagina"}`
      );
      if (emContextoExtensao) {
        document.documentElement.dataset.geridRpaControlBridge = CONTENT_BUILD_ID;
        window.addEventListener(EVENTO_LOG_GERID, (evento) => {
          const mensagem = evento.detail;
          if (typeof mensagem !== "string") return;
          chrome.runtime.sendMessage({ action: "content_log", message: mensagem }).catch(() => {
          });
        });
        window.addEventListener("message", (evento) => {
          if (evento.source !== window || evento.data?.canal !== CANAL_CONTROLE_GERID) return;
          if (evento.data?.tipoMensagem !== "solicitacao") return;
          const detalhe = evento.data;
          if (!detalhe.requestId || !detalhe.tipoControle || !detalhe.id) return;
          chrome.runtime.sendMessage({
            action: "gerid_react_control",
            tipo: detalhe.tipoControle,
            id: detalhe.id,
            valor: detalhe.valor
          }).then((resposta) => {
            window.postMessage({
              canal: CANAL_CONTROLE_GERID,
              tipoMensagem: "resposta",
              requestId: detalhe.requestId,
              resposta
            }, "*");
          }).catch((erro) => {
            window.postMessage({
              canal: CANAL_CONTROLE_GERID,
              tipoMensagem: "resposta",
              requestId: detalhe.requestId,
              resposta: { ok: false, motivo: String(erro) }
            }, "*");
          });
        });
      }
      function logToBackground(message) {
        console.log(message);
        if (!emContextoExtensao) {
          window.dispatchEvent(new CustomEvent(EVENTO_LOG_GERID, { detail: message }));
          return;
        }
        try {
          chrome.runtime.sendMessage({ action: "content_log", message }).catch(() => {
          });
        } catch (e) {
        }
      }
      function textoNormalizado(valor) {
        return (valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      }
      function elementoRenderizado(elemento) {
        const estilo = window.getComputedStyle(elemento);
        return elemento.isConnected && estilo.display !== "none" && estilo.visibility !== "hidden" && estilo.visibility !== "collapse" && elemento.getClientRects().length > 0;
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
            const selects = Array.from(document.querySelectorAll("select")).filter(elementoRenderizado);
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
          if (detectarEstadoGerid().modal === "confirmacao_final") {
            return {
              estado: "revisao_manual",
              mensagem: "Ja havia uma confirmacao final aberta na tela. Resolva no Gerid antes de rodar o robo."
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
      window.requerimentoAbertoEhDoCaso = (cpf, nome) => {
        const bruto = document.body?.innerText || "";
        const texto = textoNormalizado(bruto);
        const digitosDaTela = bruto.replace(/\D/g, "");
        const cpfAlvo = String(cpf || "").replace(/\D/g, "");
        if (cpfAlvo.length === 11 && digitosDaTela.includes(cpfAlvo)) return "sim";
        const nomeAlvo = textoNormalizado(String(nome || ""));
        if (nomeAlvo.length >= 6 && texto.includes(nomeAlvo)) return "sim";
        const temAlgumCpf = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(bruto);
        return temAlgumCpf ? "nao" : "indefinido";
      };
      window.reiniciarRequerimentoGerid = async () => {
        if (detectarEstadoGerid().etapa === "passo_1") return true;
        const botaoPrimeiroPasso = Array.from(document.querySelectorAll("button")).find((botao) => {
          const texto = textoNormalizado(botao.innerText);
          return elementoRenderizado(botao) && texto.includes("selecionar servico");
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
        const etapaAgora = detectarEstadoGerid().etapa;
        if (["passo_2", "passo_3", "passo_4", "passo_5", "passo_6", "passo_7", "passo_8", "passo_9"].includes(etapaAgora)) {
          logToBackground(`Requerimento j\xE1 aberto em ${etapaAgora}. Retomando de onde parou.`);
          return;
        }
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
        vigiarPedidoEmAberto();
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
          if (resultado.status === "sucesso") {
            logToBackground(`[ROB\xD4 FINALIZADO] PROTOCOLADO \u2014 protocolo ${resultado.protocolo}`);
            return { ...resultado, metricas: { duracaoTotalMs, etapas: temposEtapas } };
          } else if (resultado.status === "revisao") {
            logToBackground(`[ROB\xD4 FINALIZADO] Preenchido para revis\xE3o humana.`);
            return { ...resultado, metricas: { duracaoTotalMs, etapas: temposEtapas } };
          } else {
            logToBackground(`[ROB\xD4 FINALIZADO] Falha: ${resultado.erro}`);
            return { ...resultado, metricas: { duracaoTotalMs, etapas: temposEtapas } };
          }
        } catch (e) {
          const jaAberto = pedidoJaEmAberto();
          if (jaAberto) {
            logToBackground(`[ROB\xD4 FINALIZADO] J\xC1 PROTOCOLADO \u2014 pedido ${jaAberto} em aberto; n\xE3o refiz.`);
            return {
              status: "sucesso",
              protocolo: jaAberto,
              erro: `O GERID recusou refazer: j\xE1 existe o pedido ${jaAberto} em aberto para este CPF.`,
              // Sucesso SEM requerimento novo — e a diferenca importa para quem vem
              // depois. O protocolo veio de um pedido que ja existia, e a excecao que
              // trouxe o robo ate aqui estourou no MEIO do formulario: a aba ficou
              // parada no passo em que o GERID barrou, com o modal na tela. Sem essa
              // marca a fila seguia para o proximo cliente nesse estado, e o proximo
              // nao tinha de onde comecar.
              jaEstavaAberto: true
            };
          }
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
      window.detectarProtocoloGerid = () => {
        if (detectarEstadoGerid().etapa !== "comprovante") return null;
        return detectarProtocoloEmTexto(document.body?.innerText || "");
      };
      window.protocoloDaTarefaNaTela = () => ({
        protocolo: protocoloNaTelaDeTarefa(document) || "",
        // A DATA vem junto porque e ela que separa "acabei de protocolar" de "esta
        // aberto na tela um BPC que esta pessoa pediu ano passado". E a mesma regra
        // que ja protege a leitura da lista de tarefas.
        protocoladoEm: campoDaTelaDeTarefa(document, "protocolado em")
      });
      window.decidirModalDoEnvioGerid = () => {
        const decisao = decidirModalDoEnvio(document);
        return {
          tipo: decisao.tipo,
          texto: decisao.texto,
          algumDialogo: decisao.algumDialogo,
          // O modal que o robo NAO sabe tratar. E a saida mais util deste
          // diagnostico: com a frase e os rotulos na mao da para escrever a regra
          // sem inventar seletor.
          naoReconhecido: decisao.naoReconhecido
        };
      };
    }
  });
  require_index();
})();
