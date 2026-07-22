/** Junta classes condicionais (mini utilitário estilo clsx). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
