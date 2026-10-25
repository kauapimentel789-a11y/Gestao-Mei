// Endereço da versão web do app, onde ficam as páginas públicas /e/<slug>
// (encomenda) e /agendar/<slug> (agendamento, plano Pro Max).
// Definido no .env (EXPO_PUBLIC_WEB_URL); sem ele o app não monta o link.
const base = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/+$/, '');

export function publicOrderUrl(slug: string): string | null {
  return base ? `${base}/e/${slug}` : null;
}

export function publicBookingUrl(slug: string): string | null {
  return base ? `${base}/agendar/${slug}` : null;
}
