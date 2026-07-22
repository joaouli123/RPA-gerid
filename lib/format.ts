// Helpers de formatação para exibição. Comparação/normalização de dados fica
// no core (src/domain/texto.ts); aqui é só apresentação.

export function formatarCpf(valor: string | undefined): string {
  const d = (valor ?? '').replace(/\D+/g, '').slice(0, 11);
  if (d.length !== 11) return valor ?? '';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function digitosCpf(valor: string | undefined): string {
  return (valor ?? '').replace(/\D+/g, '');
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatarData(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
