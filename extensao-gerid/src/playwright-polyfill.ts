/**
 * Polyfill mínimo para rodar a lógica do Playwright (`preencherGerid.ts`) 
 * direto no DOM do Chrome (Extensão).
 */

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
    return root.querySelector(this.selector) as HTMLElement | null;
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
      const el = await this._getElement();
      return el ? 1 : 0;
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

  async isChecked() {
    const el = await this._waitForElement() as HTMLInputElement;
    return el.checked;
  }

  async setInputFiles(path: string | any) {
    // Na extensão, o File já será passado do background script
    console.log('setInputFiles não suporta arquivos locais na extensão sem File object', path);
    // Para simplificar agora, ignoramos upload
  }

  filter(options: { hasText: string | RegExp }) {
    const sel = this.selector;
    const parent = this.parent;
    const l = new MockLocator(sel, parent);
    l._getElement = async () => {
      const root = parent ? await parent._getElement() : document;
      if (!root) return null;
      const els = Array.from(root.querySelectorAll(sel)) as HTMLElement[];
      const txt = typeof options.hasText === 'string' ? options.hasText : options.hasText.source;
      return els.find(e => (e.textContent || '').includes(txt)) || null;
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

  getByText(text: string | RegExp, options?: { exact?: boolean }) {
    const l = new MockLocator('*');
    l._getElement = async () => {
      const str = typeof text === 'string' ? text : text.source;
      const els = Array.from(document.querySelectorAll('*')) as HTMLElement[];
      return els.find(e => {
        if (e.children.length > 0) return false; // leaf node only
        if (options?.exact) return e.textContent?.trim() === str;
        return e.textContent?.includes(str);
      }) || null;
    };
    return l;
  }

  getByLabel(text: string | RegExp) {
    const l = new MockLocator('label');
    l._getElement = async () => {
      const els = Array.from(document.querySelectorAll('label'));
      const str = typeof text === 'string' ? text : text.source;
      const label = els.find(e => e.textContent?.match(new RegExp(str, 'i')));
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
      const str = typeof text === 'string' ? text : text.source;
      return els.find(e => e.placeholder && e.placeholder.match(new RegExp(str, 'i'))) || null;
    };
    return l;
  }

  getByRole(role: string, options?: { name?: string | RegExp }) {
    const l = new MockLocator(`[role="${role}"], button, input[type="${role}"]`);
    l._getElement = async () => {
      let els = Array.from(document.querySelectorAll(`button, [role="${role}"], input[type="${role}"]`)) as HTMLElement[];
      if (options?.name) {
        const str = typeof options.name === 'string' ? options.name : options.name.source;
        els = els.filter(e => (e.textContent || (e as HTMLInputElement).value || '').match(new RegExp(str, 'i')));
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
