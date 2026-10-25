// DAS do MEI: a guia de cada mês vence no dia 20 do mês seguinte.
// O app não calcula o valor da guia (muda com o salário mínimo e a atividade);
// só lembra, abre o site oficial e registra o pagamento como despesa em
// "Impostos (DAS)".

import { toISODate } from '@/features/finance/logic';

/** Página oficial para emitir e pagar a guia (PGMEI). */
export const PGMEI_URL = 'https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao';

export const DAS_REMINDER_ID = 'das-lembrete';
export const DAS_DUE_DAY = 20;
/** Dia do mês em que o celular lembra, às 9 h. */
export const DAS_REMINDER_DAY = 15;

const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export interface DasPeriod {
  /** Mês a que a guia se refere (competência), primeiro e último dia. */
  from: string;
  to: string;
  /** "setembro" (com o ano quando não é o atual). */
  label: string;
  dueDate: string;
  /** Hoje já passou do dia 20. */
  overdue: boolean;
  daysLeft: number;
  /** Chave para lembrar escolhas do aparelho, ex.: "2026-09". */
  key: string;
}

/** A guia que vence neste mês: a do mês anterior. */
export function currentDasPeriod(now: Date = new Date()): DasPeriod {
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  const due = new Date(now.getFullYear(), now.getMonth(), DAS_DUE_DAY);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const name = MONTHS_FULL[first.getMonth()]!;
  return {
    from: toISODate(first),
    to: toISODate(last),
    label: first.getFullYear() === now.getFullYear() ? name : `${name} de ${first.getFullYear()}`,
    dueDate: toISODate(due),
    overdue: today.getTime() > due.getTime(),
    daysLeft: Math.round((due.getTime() - today.getTime()) / 86_400_000),
    key: toISODate(first).slice(0, 7),
  };
}

/** Descrição do lançamento, ex.: "DAS de setembro/2026". */
export function dasDescription(p: DasPeriod): string {
  const [y, m] = p.key.split('-').map(Number) as [number, number];
  return `DAS de ${MONTHS_FULL[m - 1]}/${y}`;
}

/** Texto curto do prazo para o cartão da Início. */
export function dasDueText(p: DasPeriod): string {
  if (p.overdue) return `Venceu no dia ${DAS_DUE_DAY}. Pague logo para não acumular multa e não perder o INSS.`;
  if (p.daysLeft === 0) return 'Vence hoje.';
  if (p.daysLeft === 1) return 'Vence amanhã.';
  return `Vence dia ${DAS_DUE_DAY}, daqui a ${p.daysLeft} dias.`;
}

/**
 * Próximo lembrete: dia 15 deste mês às 9 h, se a guia ainda não foi paga e o
 * dia não passou; senão dia 15 do mês que vem (a guia seguinte).
 */
export function nextDasReminder(paidThisPeriod: boolean, now: Date = new Date()): Date {
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), DAS_REMINDER_DAY, 9, 0);
  if (!paidThisPeriod && thisMonth.getTime() > now.getTime()) return thisMonth;
  return new Date(now.getFullYear(), now.getMonth() + 1, DAS_REMINDER_DAY, 9, 0);
}
