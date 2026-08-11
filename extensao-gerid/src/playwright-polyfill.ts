/**
 * Polyfill mínimo para rodar a lógica do Playwright (`preencherGerid.ts`) 
 * direto no DOM do Chrome (Extensão).
 */

function estaInteragivel(elemento: HTMLElement): boolean {
  return (
    (elemento instanceof HTMLInputElement && elemento.type === 'file') ||
    elemento.offsetParent !== null
  );
}

function casaTexto(elemento: HTMLElement, esperado: string | RegExp, exato = false): boolean {
  const texto = elemento.textContent?.trim() ?? '';
  if (typeof esperado === 'string') return exato ? texto === esperado : texto.includes(esperado);
  esperado.lastIndex = 0;
  return esperado.test(texto);
}

function definirPropriedadeNativa(
  elemento: HTMLInputElement | HTMLTextAreaElement,
  propriedade: 'value' | 'checked',
  valor: string | boolean,
): void {
  const prototipo = elemento instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototipo, propriedade)?.set;
  if (setter) setter.call(elemento, valor);
  else (elemento as any)[propriedade] = valor;
}

function clicarComoUsuario(elemento: HTMLElement): void {
  elemento.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    buttons: 1,
    view: window,
  }));
  elemento.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    buttons: 0,
    view: window,
  }));
  elemento.click();
}

class MockLocator {
  selector: string;
  parent?: MockLocator;

  constructor(selector: string, parent?: MockLocator) {
    this.selector = selector;
    this.parent = parent;
  }

  // Encontra o elemento no DOM real usando document.querySelector ou dentro do parent
  async _getElement(): Promise<HTMLElement | null> {
    const root = this.parent ? await this.parent._getElement() : document;
    if (!root) return null;
    const elementos = Array.from(root.querySelectorAll(this.selector)) as HTMLElement[];
    return elementos.find(estaInteragivel) ?? elementos[0] ?? null;
  }

  // Wait with timeout
  async _waitForElement(timeout = 5000): Promise<HTMLElement> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = await this._getElement();
      // considera visível se offsetParent não for nulo, exceto p/ inputs hidden/file
      if (el) {
        if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'file') return el;
        if (el.offsetParent !== null) return el;
      }
      await new Promise(r => setTimeout(r, 25));
    }
    throw new Error(`Timeout waiting for selector: ${this.selector}`);
  }

  async waitFor(options?: { state?: 'visible' | 'hidden' | 'attached' | 'detached', timeout?: number }) {
    const estado = options?.state || 'visible';
    const limite = Date.now() + (options?.timeout || 5000);
    while (Date.now() < limite) {
      const elemento = await this._getElement();
      const anexado = Boolean(elemento?.isConnected);
      const visivel = Boolean(elemento && estaInteragivel(elemento));
      if (
        (estado === 'visible' && visivel) ||
        (estado === 'hidden' && !visivel) ||
        (estado === 'attached' && anexado) ||
        (estado === 'detached' && !anexado)
      ) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timeout waiting for selector (${estado}): ${this.selector}`);
  }

  async count() {
    try {
      const root = this.parent ? await this.parent._getElement() : document;
      if (!root) return 0;
      return (Array.from(root.querySelectorAll(this.selector)) as HTMLElement[])
        .filter(estaInteragivel).length;
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

  locator(subSelector: string) {
    return new MockLocator(subSelector, this);
  }

  first() {
    // simplificação: querySelector já pega o primeiro
    return this;
  }

  last() {
    const sel = this.selector;
    const parent = this.parent;
    const l = new MockLocator(sel, parent);
    l._getElement = async () => {
      const root = parent ? await parent._getElement() : document;
      if (!root) return null;
      const els = Array.from(root.querySelectorAll(sel)) as HTMLElement[];
      const visiveis = els.filter(estaInteragivel);
      return visiveis[visiveis.length - 1] ?? els[els.length - 1] ?? null;
    };
    return l;
  }

  nth(index: number) {
    const sel = this.selector;
    const parent = this.parent;
    const l = new MockLocator(sel, parent);
    l._getElement = async () => {
      const root = parent ? await parent._getElement() : document;
      if (!root) return null;
      const els = Array.from(root.querySelectorAll(sel)) as HTMLElement[];
      const visiveis = els.filter(estaInteragivel);
      return visiveis[index] ?? els[index] ?? null;
    };
    return l;
  }

  async click() {
    const el = await this._waitForElement();
    if (
      (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) &&
      (el.disabled || el.getAttribute('aria-disabled') === 'true')
    ) {
      throw new Error(`Element is disabled: ${this.selector}`);
    }

    // HTMLElement.click() dispara somente `click`. Os selects oficiais do
    // GERID abrem e confirmam opções em `onMouseDown`, então a extensão precisa
    // reproduzir a sequência mínima de um clique real do navegador.
    clicarComoUsuario(el);
  }

  async fill(value: string) {
    const el = await this._waitForElement() as HTMLInputElement | HTMLTextAreaElement;
    definirPropriedadeNativa(el, 'value', value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async inputValue() {
    const el = await this._waitForElement() as HTMLInputElement;
    return el.value || '';
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
    const el = await this._getElement() as HTMLButtonElement | HTMLInputElement | null;
    return !!el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  }

  async isChecked() {
    const el = await this._getElement() as HTMLInputElement | null;
    return !!el?.checked;
  }

  async check(options?: { force?: boolean }) {
    const encontrado = options?.force ? await this._getElement() : await this._waitForElement();
    if (!(encontrado instanceof HTMLInputElement)) {
      throw new Error(`Input nao encontrado para marcar: ${this.selector}`);
    }
    const el = encontrado;
    if (!el.checked) {
      // Os pares Sim/Não do GERID são tags customizadas. O estado React é
      // alterado pelo clique no contêiner `.interaction-select`, não por uma
      // atribuição direta no input interno.
      const controle = el.closest<HTMLElement>('.interaction-select');
      clicarComoUsuario(controle ?? el);
      if (!controle && !el.checked) {
        definirPropriedadeNativa(el, 'checked', true);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const limite = Date.now() + 1_500;
    while (!el.checked && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!el.checked) {
      throw new Error(`O GERID não confirmou a marcação de ${this.selector}.`);
    }
  }

  async getAttribute(name: string) {
    return (await this._getElement())?.getAttribute(name) ?? null;
  }

  async innerText() {
    return (await this._waitForElement()).innerText;
  }

  async evaluate(fn: (element: HTMLElement, arg?: unknown) => unknown, arg?: unknown) {
    return fn(await this._waitForElement(), arg);
  }

  async setInputFiles(
    entrada:
      | string
      | { nome: string; mimeType?: string; base64: string }
      | Array<{ nome: string; mimeType?: string; base64: string }>,
  ) {
    const arquivos = Array.isArray(entrada) ? entrada : [entrada];
    if (arquivos.some((arquivo) => typeof arquivo === 'string')) {
      throw new Error('A extensão precisa receber o conteúdo do anexo, não um caminho local.');
    }
    const el = await this._waitForElement() as HTMLInputElement;
    const transferencia = new DataTransfer();
    for (const arquivo of arquivos) {
      if (typeof arquivo === 'string') continue;
      const binario = atob(arquivo.base64);
      const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
      transferencia.items.add(new File(
        [bytes],
        arquivo.nome,
        { type: arquivo.mimeType || 'application/octet-stream' },
      ));
    }
    el.files = transferencia.files;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  filter(options: { hasText: string | RegExp }) {
    const sel = this.selector;
    const parent = this.parent;
    const l = new MockLocator(sel, parent);
    l._getElement = async () => {
      const root = parent ? await parent._getElement() : document;
      if (!root) return null;
      const els = Array.from(root.querySelectorAll(sel)) as HTMLElement[];
      return els.find((e) => estaInteragivel(e) && casaTexto(e, options.hasText)) || null;
    };
    return l;
  }
}

export class MockPage {
  locator(selector: string) {
    return new MockLocator(selector);
  }
  
  async waitForSelector(selector: string) {
    return new MockLocator(selector)._waitForElement();
  }

  async evaluate<T>(fn: (arg?: any) => T, arg?: any): Promise<T> {
    return fn(arg);
  }

  getByText(text: string | RegExp, options?: { exact?: boolean }) {
    const l = new MockLocator('*');
    l._getElement = async () => {
      const els = Array.from(document.querySelectorAll('*')) as HTMLElement[];
      return els.find(e => {
        if (e.children.length > 0) return false; // leaf node only
        return estaInteragivel(e) && casaTexto(e, text, options?.exact);
      }) || null;
    };
    return l;
  }

  getByLabel(text: string | RegExp) {
    const l = new MockLocator('label');
    l._getElement = async () => {
      const els = Array.from(document.querySelectorAll('label'));
      const label = els.find((e) => estaInteragivel(e) && casaTexto(e, text));
      if (label && label.htmlFor) {
        return document.getElementById(label.htmlFor) as HTMLElement;
      }
      return null;
    };
    return l;
  }

  getByPlaceholder(text: string | RegExp) {
    const l = new MockLocator('input, textarea');
    l._getElement = async () => {
      const els = Array.from(document.querySelectorAll('input, textarea')) as HTMLInputElement[];
      return els.find((e) => {
        if (!estaInteragivel(e) || !e.placeholder) return false;
        if (typeof text === 'string') return e.placeholder.includes(text);
        text.lastIndex = 0;
        return text.test(e.placeholder);
      }) || null;
    };
    return l;
  }

  getByRole(role: string, options?: { name?: string | RegExp }) {
    const l = new MockLocator(`[role="${role}"], button, input[type="${role}"]`);
    l._getElement = async () => {
      let els = Array.from(document.querySelectorAll(`button, [role="${role}"], input[type="${role}"]`)) as HTMLElement[];
      els = els.filter(estaInteragivel);
      if (options?.name) {
        els = els.filter((e) => {
          // O GERID adiciona espaços e quebras de linha ao texto de alguns
          // botões. Normalizar aqui evita perder "Novo Requerimento".
          const nome = (
            e.getAttribute('aria-label') ||
            e.innerText ||
            e.textContent ||
            (e as HTMLInputElement).value ||
            ''
          ).trim().replace(/\s+/g, ' ');
          if (typeof options.name === 'string') return nome.includes(options.name);
          options.name.lastIndex = 0;
          return options.name.test(nome);
        });
      }
      return els[0] || null;
    };
    return l;
  }

  async waitForLoadState() {
    // Cada acao aguarda o elemento ou o estado real de destino da SPA.
    return;
  }
}

// Exporta as tipagens vazias para o TS não reclamar
export type Page = any;
export type Locator = any;
