// Acompanhamento do faturamento do MEI. Gerencial: não substitui a apuração
// oficial. Os valores vêm do banco (mei_revenue_year); aqui só a leitura.

export interface MeiMonth {
  month: number;
  revenue_cents: number;
  other_revenue_cents: number;
  received_cents: number;
}

export interface RevenueLimit {
  id: string;
  annual_limit_cents: number;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
  created_at: string;
}

export type LimitLevel = 'none' | 'ok' | 'attention' | 'near' | 'over';

/** Faixas de alerta: atenção a partir de 70% do limite, perto a partir de 90%. */
export function limitLevel(totalCents: number, limitCents: number | null): LimitLevel {
  if (!limitCents) return 'none';
  const ratio = totalCents / limitCents;
  if (ratio > 1) return 'over';
  if (ratio >= 0.9) return 'near';
  if (ratio >= 0.7) return 'attention';
  return 'ok';
}

export const LEVEL_TEXT: Record<Exclude<LimitLevel, 'none'>, string> = {
  ok: 'Dentro do limite.',
  attention: 'Atenção: já passou de 70% do limite do ano.',
  near: 'Perto do limite: já passou de 90%. Converse com seu contador.',
  over: 'Acima do limite informado. Procure seu contador.',
};

export function yearTotal(months: MeiMonth[], key: keyof Omit<MeiMonth, 'month'> = 'revenue_cents'): number {
  return months.reduce((sum, m) => sum + m[key], 0);
}

/**
 * Projeção simples para o ano: média dos meses já fechados ou em curso
 * multiplicada por 12. Só para o ano corrente; anos passados devolvem o total.
 */
export function yearProjection(months: MeiMonth[], year: number, now: Date = new Date()): number {
  const total = yearTotal(months);
  if (year !== now.getFullYear()) return total;
  const elapsed = now.getMonth() + 1;
  return Math.round((total / elapsed) * 12);
}

export const MONTH_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
