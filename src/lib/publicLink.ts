// Endereço da versão web do app, onde fica a página pública /e/<slug>.
// Definido no .env (EXPO_PUBLIC_WEB_URL); sem ele o app não monta o link.
const base = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/+$/, '');

export function publicOrderUrl(slug: string): string | null {
  return base ? `${base}/e/${slug}` : null;
}
