// Regras puras de estoque usadas nas telas. O banco recalcula e valida tudo;
// aqui é só a prévia que o usuário vê antes de confirmar.
import type { BusinessType } from '@/config/business';

export type MovementType =
  | 'purchase'
  | 'return'
  | 'manual_in'
  | 'sale'
  | 'production_consumption'
  | 'production_output'
  | 'service_consumption'
  | 'loss'
  | 'manual_out'
  | 'adjustment'
  | 'reversal';

export type MoveMode = 'in' | 'out' | 'adjust';

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  purchase: 'Compra',
  return: 'Devolução',
  manual_in: 'Outra entrada',
  sale: 'Venda',
  production_consumption: 'Consumo na produção',
  production_output: 'Produção',
  service_consumption: 'Consumo em serviço',
  loss: 'Perda',
  manual_out: 'Outra saída',
  adjustment: 'Ajuste de contagem',
  reversal: 'Estorno',
};

/** Tipos oferecidos em cada modo, conforme o modelo de negócio. */
export function movementTypesFor(mode: MoveMode, business: BusinessType): MovementType[] {
  if (mode === 'in') return ['purchase', 'return', 'manual_in'];
  if (mode === 'adjust') return ['adjustment'];
  const consumption: MovementType[] =
    business === 'production' ? ['production_consumption'] : business === 'services' ? ['service_consumption'] : [];
  return ['sale', ...consumption, 'loss', 'manual_out'];
}

/** Mesma regra da RPC: saídas e entradas genéricas, perdas e ajustes pedem motivo. */
export function reasonRequired(type: MovementType): boolean {
  return type === 'manual_in' || type === 'manual_out' || type === 'loss' || type === 'adjustment';
}

// Quantidades têm até 3 casas; contas em milésimos evitam erro de ponto flutuante.
const toMilli = (n: number | string) => Math.round(Number(n) * 1000);

/** Saldo depois da movimentação. Em ajuste, `quantity` é a contagem. */
export function balanceAfter(current: number | string, mode: MoveMode, quantity: number): number {
  const cur = toMilli(current);
  const q = toMilli(quantity);
  if (mode === 'adjust') return q / 1000;
  return (mode === 'in' ? cur + q : cur - q) / 1000;
}

/** Diferença com sinal (o que a movimentação grava). */
export function signedDelta(current: number | string, mode: MoveMode, quantity: number): number {
  return (toMilli(balanceAfter(current, mode, quantity)) - toMilli(current)) / 1000;
}

/** "+2", "−1,5" (sinal de menos tipográfico). */
export function formatSigned(q: number | string): string {
  const n = Number(q);
  const abs = Math.abs(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : abs;
}
