// Espelha app.slugify() da migração 0001, para pré-preencher o link no onboarding.
// A validação final é sempre a do banco.
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}
