import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacidade - Gerid RPA Automator',
  description: 'Politica de privacidade da extensao Gerid RPA Automator.',
};

export default function PrivacidadeExtensaoPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-12 text-zinc-800 dark:text-zinc-100">
      <h1 className="text-3xl font-semibold">Politica de privacidade</h1>
      <p className="mt-2 text-sm text-zinc-500">Gerid RPA Automator - atualizada em 11 de agosto de 2026</p>

      <div className="mt-10 space-y-8 leading-7">
        <section>
          <h2 className="text-xl font-semibold">Finalidade</h2>
          <p className="mt-2">
            A extensao automatiza o preenchimento de requerimentos BPC/LOAS no portal GERID do
            INSS para o operador autorizado. Ela nao envia nem confirma o requerimento final sem
            revisao humana.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Dados processados</h2>
          <p className="mt-2">
            Durante uma execucao, a extensao recebe do sistema da organizacao dados cadastrais,
            informacoes do grupo familiar e documentos selecionados para o protocolo. Esses dados
            sao usados somente para preencher o portal do INSS e registrar o numero do protocolo.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Armazenamento local</h2>
          <p className="mt-2">
            O Chrome armazena localmente a URL do sistema, a credencial da instalacao, o modo de
            teste, o estado da execucao e os ultimos eventos operacionais. Documentos sao mantidos
            em memoria somente durante o preenchimento e nao sao gravados pela extensao no
            computador.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Compartilhamento</h2>
          <p className="mt-2">
            Os dados transitam apenas entre o sistema da organizacao, os servicos Google Drive
            configurados pela organizacao e os portais oficiais INSS/Dataprev. Nao ha venda de
            dados, publicidade, rastreamento comercial ou compartilhamento com redes de anuncios.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Seguranca e controle</h2>
          <p className="mt-2">
            O acesso ao sistema exige autenticacao. A extensao usa conexoes HTTPS, limita sua
            atuacao aos dominios declarados e preserva a confirmacao final para o operador. A
            autenticacao SafeID e o segundo fator continuam sob controle do titular.
          </p>
          <p className="mt-2">
            O uso das informacoes recebidas obedece a Politica de Dados do Usuario da Chrome Web
            Store, inclusive aos requisitos de Uso Limitado.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Contato</h2>
          <p className="mt-2">
            Solicitacoes sobre acesso, correcao ou exclusao devem ser enviadas ao endereco de
            suporte informado na ficha desta extensao na Chrome Web Store.
          </p>
        </section>
      </div>
    </main>
  );
}
