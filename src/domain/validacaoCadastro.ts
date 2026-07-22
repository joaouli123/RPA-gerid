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

  if (integrantes.length === 0) {
    erros.push('O grupo familiar precisa ter ao menos o próprio requerente (Titular).');
  }

  const titulares = integrantes.filter((i) => ehTitular(i.parentesco));
  if (integrantes.length > 0 && titulares.length === 0) {
    erros.push('Marque exatamente um integrante como "Titular" (o próprio requerente).');
  }
  if (titulares.length > 1) {
    erros.push(`O grupo familiar tem ${titulares.length} "Titular" — deve haver apenas um.`);
  }

  integrantes.forEach((integrante, i) => {
    const posicao = `Integrante ${i + 1}`;
    if (!integrante.nome.trim()) erros.push(`${posicao}: informe o nome.`);
    if (!integrante.parentesco.trim()) erros.push(`${posicao}: informe o parentesco.`);
    const cpfIntegrante = apenasDigitos(integrante.cpf);
    if (cpfIntegrante && padronizarCpf(integrante.cpf).length !== 11) {
      erros.push(`${posicao}: CPF inválido (precisa ter 11 dígitos ou ficar em branco).`);
    }
  });

  // O CPF do Titular tem que bater com o do cliente.
  const titular = titulares[0];
  if (titular?.cpf && cpf && padronizarCpf(titular.cpf) !== cpf) {
    erros.push('O CPF do Titular precisa ser igual ao CPF do requerente.');
  }

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
    const integrante: Integrante = {
      nome: i.nome.trim(),
      parentesco: i.parentesco.trim(),
    };
    // O Titular herda o CPF do requerente quando vem em branco.
    const cpf = padronizarCpf(i.cpf) || (ehTitular(i.parentesco) ? cpfCliente : '');
    if (cpf) integrante.cpf = cpf;
    if (i.estadoCivil?.trim()) integrante.estadoCivil = i.estadoCivil.trim();
    if (i.dataNascimento?.trim()) integrante.dataNascimento = i.dataNascimento.trim();
    if (i.renda?.trim()) integrante.renda = i.renda.trim();
    return integrante;
  });

  return { cliente, integrantes };
}
