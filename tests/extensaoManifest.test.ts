import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('manifesto publicado da extensao', () => {
  it('usa permissoes minimas e dominios especificos', async () => {
    const manifesto = JSON.parse(await readFile(
      path.join(process.cwd(), 'extensao-gerid', 'manifest.json'),
      'utf8',
    ));

    expect(manifesto.version).toBe('1.7.16');
    expect(manifesto.permissions).not.toContain('debugger');
    expect(manifesto.permissions).not.toContain('activeTab');
    // `downloads` É pedida, de propósito. O GERID entrega o comprovante de duas
    // formas conforme a tela: montado na própria página (visível pelos ganchos
    // do content script) ou como download de verdade do navegador — que nenhum
    // gancho de página enxerga. Sem esta permissão o segundo caso some sem
    // deixar rastro, que foi exatamente o que aconteceu em produção.
    // Continua fora tudo que daria poder além do necessário:
    expect(manifesto.permissions).not.toContain('debugger');
    expect(manifesto.permissions).not.toContain('activeTab');
    expect(manifesto.permissions).not.toContain('<all_urls>');
    expect(manifesto.permissions).not.toContain('cookies');
    expect(manifesto.permissions).not.toContain('webRequest');
    // O endereco automatico do Coolify (sslip.io) saiu desta lista em
    // 18/08/2026, quando o escritorio ficou com um dominio so e aquele endereco
    // deixou de existir no servidor. Este teste guarda a lista fechada: host que
    // entra aqui ganha o token do painel, entao entrar tem que ser decisao, nao
    // sobra de migracao. O curinga cobre subdominio do proprio escritorio
    // (painel., rpa., ...) para que mudar de ideia nao exija reinstalar a
    // extensao em todas as maquinas.
    expect(manifesto.host_permissions).toEqual([
      'https://fabriciodouglas.net/*',
      'https://*.fabriciodouglas.net/*',
      'https://atendimento.inss.gov.br/*',
      'https://geridinss.dataprev.gov.br/*',
    ]);
    // O curinga NAO pode virar permissao ampla: dominio de terceiro continua
    // fora, e e isso que este teste guarda.
    for (const host of manifesto.host_permissions) {
      expect(host).not.toContain('://*/');
      expect(host).not.toBe('https://*/*');
    }
    expect(manifesto.content_scripts[0]).toMatchObject({
      matches: [
        'https://fabriciodouglas.net/*',
        'https://*.fabriciodouglas.net/*',
      ],
      js: ['bootstrap.js'],
    });
    expect(manifesto.content_scripts[1].matches).toEqual([
      'https://atendimento.inss.gov.br/*',
    ]);
  });
});
