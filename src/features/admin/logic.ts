import type { BusinessType, PracticeArea } from '@/config/business';

import type { PlanKey } from './api';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const PLAN_LABEL: Record<PlanKey, string> = { free: 'Grátis', pro: 'Pro', pro_max: 'Pro Max' };

/** Rótulo do tipo de negócio, com "Atendimentos" para serviços com hora marcada. */
export function businessLabel(type: BusinessType | null, area: PracticeArea | null): string {
  if (!type) return 'Sem empresa';
  if (type === 'services' && area) return 'Atendimentos';
  return { production: 'Produção', resale: 'Revenda', services: 'Serviços' }[type];
}

/** Variação % contra o período anterior; null quando não havia base. */
export function growthPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** "2026-10-26" → "26/10" (dia) ou "out/26" (mês). */
export function bucketLabel(bucket: string, byMonth: boolean): string {
  const [y, m, d] = bucket.split('-');
  return byMonth ? `${MONTHS[Number(m) - 1]}/${y!.slice(2)}` : `${d}/${m}`;
}

/** Porcentagem inteira de `part` sobre `total` (0 quando não há total). */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Data e hora curtas em pt-BR: "26/10/2026 09:15". */
export function formatDateTime(iso: string | null): string {
  if (!iso) return 'nunca';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "2026-11-05" → "05/11/2026". */
export function formatDate(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}
