import { describe, expect, it } from 'vitest';

import { avisoInformativo, avisosQueImpedemProtocolo } from '../extensao-gerid/src/preencherGerid';

/**
 * Quem decide se o robô protocola.
 *
 * O filtro fareja palavra em texto livre, e isso tem os dois erros possíveis:
 * deixar passar um requerimento incompleto (grave) ou barrar um que estava
 * inteiro (foi o que aconteceu — a frase "Confira os anexos antes de concluir"
 * derrubou o passo 10 sozinha). Os dois lados ficam presos aqui.
 */
describe('avisos que impedem o protocolo', () => {
  it('nao bloqueia por aviso marcado como informativo', () => {
    const avisos = [
      avisoInformativo(
        'Esperava 12 caixas de anexo e encontrei 11 — o GERID pode ter mudado. '
          + 'Confira os anexos antes de concluir.',
      ),
    ];
    expect(avisosQueImpedemProtocolo(avisos)).toEqual([]);
  });

  it('bloqueia quando o robo diz que NAO conseguiu fazer alguma coisa', () => {
    // Cada um destes é o robô admitindo que deixou buraco. Protocolar por cima
    // manda ao INSS um requerimento que ele mesmo sabe incompleto.
    const bloqueiam = [
      'Documento "Procuração" não tem caixa mapeada no GERID — anexe manualmente.',
      'O GERID não registrou 2 arquivo(s) em "OAB" — anexe manualmente. (timeout)',
      'Não consegui marcar "Declaro que li e concordo com as informações acima".',
      'Faltou responder a pergunta obrigatória sobre representante legal.',
    ];
    for (const aviso of bloqueiam) {
      expect(avisosQueImpedemProtocolo([aviso]), aviso).toHaveLength(1);
    }
  });

  it('aviso desconhecido continua bloqueando por padrao', () => {
    // A marca é opt-in: texto novo que ninguém classificou cai no lado seguro.
    expect(avisosQueImpedemProtocolo(['Não consegui abrir a tela seguinte.'])).toHaveLength(1);
  });

  it('nao bloqueia texto neutro', () => {
    expect(avisosQueImpedemProtocolo(['Anexei 6 documentos.'])).toEqual([]);
  });
});
