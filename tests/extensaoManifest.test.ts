import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('manifesto publicado da extensao', () => {
  it('usa permissoes minimas e dominios especificos', async () => {
    const manifesto = JSON.parse(await readFile(
      path.join(process.cwd(), 'extensao-gerid', 'manifest.json'),
      'utf8',
    ));

    expect(manifesto.version).toBe('1.5.7');
    expect(manifesto.permissions).toContain('debugger');
    expect(manifesto.permissions).not.toContain('activeTab');
    expect(manifesto.permissions).not.toContain('downloads');
    expect(manifesto.host_permissions).toEqual([
      'https://vmkcogtpgc1dgd5ae6gjfz1n.179.198.98.63.sslip.io/*',
      'https://atendimento.inss.gov.br/*',
      'https://geridinss.dataprev.gov.br/*',
    ]);
    expect(manifesto.content_scripts[0]).toMatchObject({
      matches: ['https://vmkcogtpgc1dgd5ae6gjfz1n.179.198.98.63.sslip.io/*'],
      js: ['bootstrap.js'],
    });
    expect(manifesto.content_scripts[1].matches).toEqual([
      'https://atendimento.inss.gov.br/*',
    ]);
  });
});
