// Monitor de erros (Sentry). Liga só com EXPO_PUBLIC_SENTRY_DSN; sem ele,
// nada é enviado. Só vão o erro, a tela e o aparelho: sem usuário, e-mail,
// cabeçalhos, corpo de requisição ou dados dos clientes, e os endereços
// perdem a parte depois do "?" e o código do link do cliente (/horario/...).
import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || null;

export const isMonitoringEnabled = Boolean(dsn);

/** Tira a busca (?...), o fragmento (#...) e o código do link do cliente. */
export function scrubUrl(url: string): string {
  return url
    .replace(/[?#].*$/, '')
    .replace(/\/horario\/[^/]+/g, '/horario/[codigo]')
    .replace(/\/nova-senha.*$/, '/nova-senha');
}

type Scrubbable = {
  user?: unknown;
  request?: { url?: string; headers?: unknown; cookies?: unknown; data?: unknown; query_string?: unknown };
  breadcrumbs?: { data?: Record<string, unknown> | undefined; message?: string }[];
};

/** Remove dados pessoais do evento antes de enviar. */
export function scrubEvent<T extends Scrubbable>(event: T): T {
  delete event.user;
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
  }
  event.breadcrumbs?.forEach(scrubBreadcrumb);
  return event;
}

function scrubBreadcrumb(b: { data?: Record<string, unknown> | undefined; message?: string }) {
  if (b.data) {
    for (const key of ['url', 'from', 'to']) {
      if (typeof b.data[key] === 'string') b.data[key] = scrubUrl(b.data[key] as string);
    }
    delete b.data.body;
    delete b.data.request_body;
    delete b.data.response_body;
  }
  return b;
}

export function initMonitoring() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
    environment: __DEV__ ? 'development' : 'production',
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => {
      // Mensagens do console podem ter dados digitados; ficam de fora.
      if (breadcrumb.category === 'console') return null;
      return scrubBreadcrumb(breadcrumb);
    },
  });
}

/** Envolve a raiz do app para capturar erros de tela (sem DSN, não muda nada). */
export function withMonitoring<P extends Record<string, unknown>>(Root: ComponentType<P>): ComponentType<P> {
  return dsn ? Sentry.wrap(Root) : Root;
}

export function reportError(error: unknown) {
  if (dsn) Sentry.captureException(error);
}
