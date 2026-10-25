// Endereço da versão web do app, onde ficam as páginas públicas /e/<slug>
// (encomenda), /agendar/<slug> (agendamento, plano Pro Max) e /horario/<código>.
// Definido no .env (EXPO_PUBLIC_WEB_URL); sem ele o app não monta o link.
const base = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/+$/, '');

export function publicOrderUrl(slug: string): string | null {
  return base ? `${base}/e/${slug}` : null;
}

export function publicBookingUrl(slug: string): string | null {
  return base ? `${base}/agendar/${slug}` : null;
}

/**
 * Link do cliente para remarcar ou cancelar (/horario/<código>). Na web usa o
 * endereço em que o cliente está, para o link sempre abrir no mesmo site.
 */
export function bookingManageUrl(token: string): string | null {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : base;
  return origin ? `${origin}/horario/${token}` : null;
}
