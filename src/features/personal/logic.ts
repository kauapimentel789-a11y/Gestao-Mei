// Regras puras de "Minhas finanças". Os valores vêm prontos do banco
// (finance_summary, finance_report e os lançamentos); aqui só se comparam e se
// escrevem as frases.
import { changePct, formatPct, type Slice } from '@/features/finance/dashboard';
import type { Direction } from '@/features/finance/logic';
import { formatCents } from '@/lib/money';

export type EntryFilter = 'all' | 'out' | 'in';

const FILTER_DIRECTION: Record<Exclude<EntryFilter, 'all'>, Direction> = { out: 'payable', in: 'receivable' };

/** Lançamentos do filtro: tudo, só gastos ou só entradas. */
export function filterByDirection<T extends { direction: Direction }>(list: T[], filter: EntryFilter): T[] {
  if (filter === 'all') return list;
  return list.filter((e) => e.direction === FILTER_DIRECTION[filter]);
}

/** Quanto da renda sobrou, em % com uma casa; null sem entradas no período. */
export function savingsPct(inCents: number, outCents: number): number | null {
  if (inCents <= 0) return null;
  return Math.round(((inCents - outCents) / inCents) * 1000) / 10;
}

/** Frase de resumo do mês no Início pessoal. */
export function personalInsight(input: { inCents: number; outCents: number; prevOutCents?: number; top?: Slice }): string {
  const { inCents, outCents, prevOutCents, top } = input;
  if (inCents === 0 && outCents === 0) return 'Nada lançado neste mês ainda. Comece pelo que você gastou hoje: leva poucos segundos.';
  const parts: string[] = [];
  const net = inCents - outCents;
  const saved = savingsPct(inCents, outCents);
  if (saved === null) {
    parts.push(`Neste mês saíram ${formatCents(outCents)} e nenhuma entrada foi lançada.`);
  } else if (net >= 0) {
    parts.push(`Neste mês sobraram ${formatCents(net)}, ${formatPct(saved)} do que entrou.`);
  } else {
    parts.push(`Neste mês saiu ${formatCents(-net)} a mais do que entrou. Vale olhar os maiores gastos.`);
  }
  if (prevOutCents !== undefined) {
    const pct = changePct(outCents, prevOutCents);
    if (pct !== null && pct !== 0) parts.push(`Seus gastos estão ${formatPct(pct)} ${pct > 0 ? 'acima' : 'abaixo'} do mês passado.`);
  }
  if (top) parts.push(`O maior gasto é ${top.name} (${formatPct(top.pct)}).`);
  return parts.join(' ');
}

const PERSONAL_PATHS = ['/', '/financeiro', '/contas', '/cartoes', '/a-pagar', '/configuracoes', '/nova-empresa', '/excluir-conta', '/admin'];
const BUSINESS_FINANCE = ['mei', 'quem-me-deve', 'relatorios', 'venda-rapida'];

/**
 * Telas que existem em Minhas finanças. As demais são da empresa: quem abre o
 * endereço com o pessoal ativo (ex.: site recarregado) volta para o Início.
 */
export function personalAllows(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (PERSONAL_PATHS.includes(path)) return true;
  const [first, second, ...rest] = path.split('/').filter(Boolean);
  if (first === 'cartao' && second !== undefined && rest.length === 0) return true;
  return first === 'financeiro' && second !== undefined && rest.length === 0 && !BUSINESS_FINANCE.includes(second);
}
