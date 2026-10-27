import { billsTimeline, cardUsage, currentStatement, dueGroup, installmentPreview, parseCardDay, splitInstallments, statementLabel } from '@/features/cards/logic';

describe('cartões e parcelas', () => {
  it('divide como o banco', () => {
    expect(splitInstallments(100000, 3)).toEqual({ first: 33334, rest: 33333 });
    expect(splitInstallments(90000, 3)).toEqual({ first: 30000, rest: 30000 });
    expect(splitInstallments(2, 3)).toBeNull();
    expect(splitInstallments(1000, 49)).toBeNull();
  });

  it('mostra a prévia das parcelas', () => {
    expect(installmentPreview(90000, 3)).toMatch(/^3x de R\$\s?300,00$/);
    expect(installmentPreview(100000, 3)).toMatch(/^1ª de R\$\s?333,34 e 2x de R\$\s?333,33$/);
    expect(installmentPreview(5000, 1)).toMatch(/^À vista: R\$\s?50,00$/);
  });

  it('nomeia a fatura pelo mês de vencimento', () => {
    const now = new Date(2026, 9, 27);
    expect(statementLabel('2026-11-01', now)).toBe('Fatura de novembro');
    expect(statementLabel('2027-01-01', now)).toBe('Fatura de janeiro de 2027');
  });

  it('calcula o limite usado', () => {
    expect(cardUsage(500000, [{ open_cents: 100000 }, { open_cents: 50000 }])).toEqual({ used: 150000, available: 350000, ratio: 0.3 });
    expect(cardUsage(null, [{ open_cents: 100 }])).toEqual({ used: 100, available: null, ratio: null });
    expect(cardUsage(1000, [{ open_cents: 2000 }]).ratio).toBe(1);
  });

  it('escolhe a fatura de agora', () => {
    const list = [
      { statement_month: '2026-12-01', status: 'open' as const },
      { statement_month: '2026-10-01', status: 'paid' as const },
      { statement_month: '2026-11-01', status: 'closed' as const },
    ];
    expect(currentStatement(list)?.statement_month).toBe('2026-11-01');
    expect(currentStatement([{ statement_month: '2026-10-01', status: 'paid' as const }])?.statement_month).toBe('2026-10-01');
    expect(currentStatement([])).toBeNull();
  });

  it('confere o dia do cartão', () => {
    expect(parseCardDay('5')).toBe(5);
    expect(parseCardDay(' 31 ')).toBe(31);
    expect(parseCardDay('0')).toBeNull();
    expect(parseCardDay('3,5')).toBeNull();
    expect(parseCardDay('')).toBeNull();
  });

  it('agrupa os vencimentos', () => {
    expect(dueGroup('2026-10-26', '2026-10-27')).toBe('overdue');
    expect(dueGroup('2026-10-27', '2026-10-27')).toBe('soon');
    expect(dueGroup('2026-11-03', '2026-10-27')).toBe('soon');
    expect(dueGroup('2026-11-04', '2026-10-27')).toBe('later');
  });

  it('junta contas e faturas numa lista só', () => {
    const now = new Date(2026, 9, 27);
    const items = billsTimeline(
      [
        { id: 'luz', description: 'Conta de luz', due_date: '2026-11-10', open_cents: 15000, card_id: null },
        { id: 'parcela', description: 'TV (1/3)', due_date: '2026-11-12', open_cents: 33334, card_id: 'nu' },
        { id: 'paga', description: 'Água', due_date: '2026-11-01', open_cents: 0, card_id: null },
      ],
      [
        { card_id: 'nu', statement_month: '2026-11-01', due_date: '2026-11-12', open_cents: 53334 },
        { card_id: 'nu', statement_month: '2026-10-01', due_date: '2026-10-12', open_cents: 0 },
      ],
      () => 'Nubank',
      now,
    );
    expect(items.map((i) => i.title)).toEqual(['Conta de luz', 'Fatura de novembro · Nubank']);
    expect(items[1]).toMatchObject({ kind: 'statement', id: 'nu', month: '2026-11-01', openCents: 53334 });
  });
});
