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
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Timeout waiting for selector: ${this.selector}`);
  }

  async waitFor(options?: { state?: 'visible' | 'hidden' | 'attached' | 'detached', timeout?: number }) {
    await this._waitForElement(options?.timeout || 5000);
  }

  async count() {
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
      const els = root.querySelectorAll(sel);
      return (els[index] as HTMLElement) || null;
    };
    return l;
  }

  async click() {
    const el = await this._waitForElement();
    el.click();
    // Dispatch events if it's a radio or checkbox
    if (el.tagName === 'INPUT') {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  async fill(value: string) {
    const el = await this._waitForElement() as HTMLInputElement;
    el.value = value;
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

  async isChecked() {
    const el = await this._waitForElement() as HTMLInputElement;
    return el.checked;
  }

  async check() {
    const el = await this._waitForElement() as HTMLInputElement;
    if (!el.checked) el.click();
    if (!el.checked) {
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
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

  async setInputFiles(arquivo: string | { nome: string; mimeType?: string; base64: string }) {
    if (typeof arquivo === 'string') {
      throw new Error('A extensão precisa receber o conteúdo do anexo, não um caminho local.');
    }
    const el = await this._waitForElement() as HTMLInputElement;
    const binario = atob(arquivo.base64);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    const file = new File([bytes], arquivo.nome, { type: arquivo.mimeType || 'application/octet-stream' });
    const transferencia = new DataTransfer();
    transferencia.items.add(file);
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
          const nome = e.textContent || (e as HTMLInputElement).value || '';
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
    await new Promise(r => setTimeout(r, 1000));
  }
}

// Exporta as tipagens vazias para o TS não reclamar
export type Page = any;
export type Locator = any;
