#!/usr/bin/env node
/**
 * Copia a extensão de `extensao-gerid/` para a pasta que o Chrome carrega.
 *
 * Existe porque são DUAS pastas, e por um dia inteiro ninguém percebeu. O
 * repositório tem `extensao-gerid/` — onde o código é escrito, testado e
 * versionado. O Chrome, porém, foi apontado para uma cópia solta em
 * `outputs/`, fora do repositório. Corrigir de um lado e recarregar do outro
 * não faz nada: o robô continuou escrevendo `01/01/2015` no filtro de data
 * depois de três commits removendo exatamente isso, e a única pista era o
 * número da versão no popup, que ninguém tinha motivo para desconfiar.
 *
 * Rodar isto é o passo que faltava entre "corrigido" e "corrigido no navegador".
 *
 * ⚠️ O NOME da pasta de destino não muda com a versão, de propósito.
 * Extensão carregada como "sem compactação" tem o ID derivado do CAMINHO, e
 * `chrome.storage.local` é por ID. Renomear a pasta a cada versão criaria uma
 * extensão nova aos olhos do Chrome: o operador perderia a chave do painel e
 * teria que parear de novo a cada atualização. O nome é só um rótulo; a versão
 * que vale está dentro do manifest.json — e é ela que o popup mostra.
 */
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origem = path.join(raiz, 'extensao-gerid');

/**
 * Só o que a extensão precisa para RODAR.
 *
 * `src/`, `node_modules/`, `tsconfig.json` e as sondas de mapeamento ficam para
 * trás: são ferramenta de desenvolvimento. Mandar tudo faria a pasta do Chrome
 * crescer com arquivo que ninguém executa e, pior, esconderia no meio o que de
 * fato mudou quando alguma coisa desse errado.
 */
const ARQUIVOS = [
  'manifest.json',
  'background.js',
  'content.js',
  'bootstrap.js',
  'popup.html',
  'popup.js',
  'icon128.png',
  'LEIA-ME-ATUALIZACAO.txt',
];

/** O destino padrão é a pasta que o Chrome já carrega hoje. */
function destinoPadrao() {
  return path.resolve(raiz, '..', '..', 'outputs', 'Gerid-RPA-Automator-1.6.0');
}

/**
 * Tudo que o manifesto aponta precisa estar na lista de cópia.
 *
 * Sem esta conferência, acrescentar um script ao manifesto e esquecer de
 * publicá-lo daria uma extensão que carrega pela metade — e o erro apareceria
 * como comportamento estranho no GERID, não como arquivo faltando.
 */
function referenciasDoManifesto(manifesto) {
  return [
    manifesto.background?.service_worker,
    manifesto.action?.default_popup,
    manifesto.action?.default_icon,
    ...Object.values(manifesto.icons ?? {}),
    ...(manifesto.content_scripts ?? []).flatMap((c) => c.js ?? []),
  ].filter(Boolean);
}

async function main() {
  const destino = process.env.RPA_EXTENSAO_DESTINO || destinoPadrao();

  const manifesto = JSON.parse(await readFile(path.join(origem, 'manifest.json'), 'utf8'));
  const faltando = referenciasDoManifesto(manifesto).filter((a) => !ARQUIVOS.includes(a));
  if (faltando.length) {
    throw new Error(
      `O manifesto aponta arquivos que este script nao copia: ${faltando.join(', ')}. `
      + 'Acrescente-os a lista ARQUIVOS em scripts/publicar-extensao.mjs.',
    );
  }

  // Destino que não existe quase nunca é pasta nova a criar — é caminho errado.
  // Criar do nada devolveria "publiquei!" e uma pasta que o Chrome não carrega,
  // que é a forma mais cara de errar aqui: parece sucesso.
  const existe = await stat(destino).then((s) => s.isDirectory()).catch(() => false);
  if (!existe) {
    throw new Error(
      `A pasta de destino nao existe: ${destino}\n`
      + 'Confira o caminho real em chrome://extensions (ele aparece embaixo do nome da '
      + 'extensao, em "Carregada de") e rode de novo com RPA_EXTENSAO_DESTINO=<caminho>.',
    );
  }

  await mkdir(destino, { recursive: true });
  for (const arquivo of ARQUIVOS) {
    await copyFile(path.join(origem, arquivo), path.join(destino, arquivo));
  }

  // O que sobrou lá e não veio daqui. Costuma ser resto de versão antiga; não
  // apago por conta própria (a pasta é do operador), mas calar seria pior.
  const sobrando = (await readdir(destino)).filter((a) => !ARQUIVOS.includes(a));

  console.log(`Extensao v${manifesto.version} publicada em:\n  ${destino}`);
  console.log(`${ARQUIVOS.length} arquivos copiados de extensao-gerid/.`);
  if (sobrando.length) console.log(`Arquivos estranhos na pasta (ignorados): ${sobrando.join(', ')}`);
  console.log('\nAgora abra chrome://extensions e clique em Recarregar. '
    + `O popup tem que mostrar v${manifesto.version}.`);
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
