import { describe, expect, it } from 'vitest';
import { detectarProtocoloEmTexto } from '@/extensao-gerid/src/detectarProtocolo';

describe('deteccao do protocolo na tela final do GERID', () => {
  it('aceita protocolos rotulados nos formatos usuais', () => {
    expect(detectarProtocoloEmTexto('Protocolo gerado: 2026.0001234567-8')).toBe('2026.0001234567-8');
    expect(detectarProtocoloEmTexto('Numero do requerimento: 123456789012345')).toBe('123456789012345');
  });

  it('nao confunde CPF, CEP ou numero solto com protocolo', () => {
    expect(detectarProtocoloEmTexto('CPF 123.456.789-01 CEP 49000-000')).toBeNull();
    expect(detectarProtocoloEmTexto('Confirmar requerimento para 12345678901')).toBeNull();
  });
});
