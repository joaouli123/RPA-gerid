import type { Cliente, Integrante } from './types';
import { ehTitular } from './grupoFamiliar';
import { apenasDigitos, padronizarCpf } from './texto';

/**
 * Valida o formulário de cadastro ANTES de gravar na planilha.
 * Diferente de validacaoCliente (que classifica quem já está na planilha),
 * aqui o objetivo é impedir que dado ruim ENTRE.
 */
export interface EntradaCadastro {
  cliente: Cliente;
  integrantes: Integrante[];
}

export function validarCadastro(entrada: EntradaCadastro): string[] {
  const erros: string[] = [];
  const { cliente, integrantes } = entrada;

  if (!cliente.nome.trim()) erros.push('Informe o nome do requerente.');
  if (!cliente.cidade.trim()) erros.push('Informe a cidade do protocolo.');
  if (!cliente.cep.trim()) erros.push('Informe o CEP (é o que localiza a agência).');

  const cpf = padronizarCpf(cliente.cpf);
  if (!cpf) erros.push('Informe o CPF do requerente.');
  else if (cpf.length !== 11) erros.push(`CPF do requerente inválido: precisa ter 11 dígitos.`);

  // Grupo familiar simplificado (decisão do escritório): basta o CPF de cada
  // pessoa da casa. O requerente é a pessoa cujo CPF é o do cliente (ou a linha
  // marcada "Titular"); ele não precisa repetir o CPF, herda o do cadastro.
  const ehRequerente = (i: Integrante): boolean =>
    (cpf.length === 11 && padronizarCpf(i.cpf) === cpf) || ehTitular(i.parentesco);

  if (!integrantes.some(ehRequerente)) {
    erros.push('O grupo familiar precisa incluir o próprio requerente.');
  }

  // Cada FAMILIAR (quem não é o requerente) precisa do CPF — é a única
  // informação que se digita; o CadÚnico traz o resto no GERID.
  let numeroFamiliar = 0;
  integrantes.forEach((integrante) => {
    if (ehRequerente(integrante)) return;
    numeroFamiliar += 1;
    const posicao = `Familiar ${numeroFamiliar}`;
    const cpfIntegrante = padronizarCpf(integrante.cpf);
    if (!cpfIntegrante) erros.push(`${posicao}: informe o CPF.`);
    else if (cpfIntegrante.length !== 11) {
      erros.push(`${posicao}: CPF inválido (precisa ter 11 dígitos).`);
    }
  });

  // Sem CPF repetido dentro do grupo.
  const cpfs = integrantes.map((i) => padronizarCpf(i.cpf)).filter((c) => c.length === 11);
  const duplicados = [...new Set(cpfs.filter((c, i) => cpfs.indexOf(c) !== i))];
  if (duplicados.length > 0) {
    erros.push(`CPF repetido no grupo familiar: ${duplicados.join(', ')}.`);
  }

  return erros;
}

/** Normaliza o que veio do formulário (CPF padronizado, campos aparados). */
export function normalizarCadastro(entrada: EntradaCadastro): EntradaCadastro {
  const cpfCliente = padronizarCpf(entrada.cliente.cpf);

  const cliente: Cliente = {
    ...entrada.cliente,
    nome: entrada.cliente.nome.trim(),
    cpf: cpfCliente,
    cidade: entrada.cliente.cidade.trim(),
    cep: entrada.cliente.cep.trim(),
    // Sem coluna "Pasta" na planilha, a pasta do Drive é o próprio nome.
    pasta: entrada.cliente.pasta?.trim() || entrada.cliente.nome.trim(),
  };
  const telefone = entrada.cliente.telefone?.trim();
  if (telefone) cliente.telefone = telefone;
  else delete cliente.telefone;

  const integrantes = entrada.integrantes.map((i) => {
    // Identifica o requerente pelo CPF (o do cliente) ou pelo rótulo antigo.
    const cpf = padronizarCpf(i.cpf) || (ehTitular(i.parentesco) ? cpfCliente : '');
    const ehReq = (cpf && cpf === cpfCliente) || ehTitular(i.parentesco);

    const integrante: Integrante = {
      nome: i.nome?.trim() ?? '',
      // O requerente vira "Titular" (o GERID já o traz como Requerente). Os
      // demais podem ficar sem parentesco — ele é escolhido na revisão, já que
      // o essencial (o CPF) basta para o CadÚnico puxar a pessoa.
      parentesco: ehReq ? 'Titular' : (i.parentesco?.trim() ?? ''),
    };
    if (cpf) integrante.cpf = cpf;
    if (i.estadoCivil?.trim()) integrante.estadoCivil = i.estadoCivil.trim();
    if (i.dataNascimento?.trim()) integrante.dataNascimento = i.dataNascimento.trim();
    if (i.renda?.trim()) integrante.renda = i.renda.trim();
    return integrante;
  });

  return { cliente, integrantes };
}
