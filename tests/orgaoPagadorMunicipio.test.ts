import { describe, expect, it } from 'vitest';
import { escolherMunicipioDoOrgaoPagador } from '../extensao-gerid/src/preencherGerid';

/**
 * O caso do IAGO (18/08/2026): mora em Igrapiuna, o GERID nao tem agencia
 * pagadora la, e o robo parou quatro rondas seguidas na mesma tela com UMA
 * unica opcao na frente (CAMAMU). O operador terminou na mao escolhendo
 * exatamente aquela opcao.
 *
 * Estes testes tratam os dois lados como igualmente importantes: seguir quando
 * a escolha esta determinada, e parar quando ela seria chute. Orgao pagador e
 * onde a pessoa recebe o dinheiro — "nunca parar" nao pode virar "sempre
 * adivinhar".
 */
describe('municipio do orgao pagador quando a cidade do cliente nao esta na lista', () => {
  it('usa a unica opcao oferecida — o caso do IAGO', () => {
    expect(escolherMunicipioDoOrgaoPagador('Igrapiúna', '', ['CAMAMU']))
      .toEqual({ rotulo: 'CAMAMU', motivo: 'era a unica opcao oferecida pelo GERID' });
  });

  it('prefere o municipio da agencia que o passo 8 ja escolheu', () => {
    const escolha = escolherMunicipioDoOrgaoPagador(
      'Igrapiúna',
      'AGÊNCIA CAMAMU',
      ['VALENÇA', 'CAMAMU', 'ITUBERÁ'],
    );
    expect(escolha?.rotulo).toBe('CAMAMU');
  });

  it('aceita o nome do card do passo 8 em qualquer das tres grafias', () => {
    for (const daUnidade of ['CAMAMU', 'Camamu - BA', 'CAMAMU.BA', 'AGÊNCIA CAMAMU']) {
      expect(escolherMunicipioDoOrgaoPagador('Igrapiúna', daUnidade, ['VALENÇA', 'CAMAMU'])?.rotulo)
        .toBe('CAMAMU');
    }
  });

  it('casa a mesma cidade escrita diferente na planilha', () => {
    // Acento perdido e letra trocada sao o defeito de digitacao da planilha,
    // nao outra cidade.
    expect(escolherMunicipioDoOrgaoPagador('Igrapiuna', '', ['VALENÇA', 'IGRAPIÚNA'])?.rotulo)
      .toBe('IGRAPIÚNA');
    expect(escolherMunicipioDoOrgaoPagador('Igrapiúma', '', ['VALENÇA', 'IGRAPIÚNA'])?.rotulo)
      .toBe('IGRAPIÚNA');
  });

  it('nao confunde municipios vizinhos de nome parecido', () => {
    // Camamu e Camacan existem os dois na Bahia. Sem cidade do cliente na lista
    // e sem unidade do passo 8, isto e duvida de verdade: tem que parar.
    expect(escolherMunicipioDoOrgaoPagador('Camamu', '', ['CAMACAN', 'VALENÇA'])).toBeNull();
  });

  it('para quando ha varias cidades e nenhuma tem ligacao com o caso', () => {
    expect(escolherMunicipioDoOrgaoPagador('Igrapiúna', '', ['SALVADOR', 'FEIRA DE SANTANA']))
      .toBeNull();
  });

  it('para quando o GERID nao ofereceu nada', () => {
    expect(escolherMunicipioDoOrgaoPagador('Igrapiúna', 'CAMAMU', [])).toBeNull();
    // "Limpar" e botao do componente gov.br, nao cidade. Trata-lo como opcao
    // faria o robo escolher "Limpar" como orgao pagador.
    expect(escolherMunicipioDoOrgaoPagador('Igrapiúna', 'CAMAMU', ['Limpar'])).toBeNull();
  });

  it('o caminho normal continua sendo o nome igual', () => {
    expect(escolherMunicipioDoOrgaoPagador('Camamu', 'VALENÇA', ['VALENÇA', 'CAMAMU']))
      .toEqual({ rotulo: 'CAMAMU', motivo: 'mesmo municipio do cliente' });
  });
});
