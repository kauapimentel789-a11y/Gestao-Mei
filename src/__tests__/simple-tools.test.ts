import { getBusinessConfig } from '@/config/business';
import { currentDasPeriod, dasDescription, dasDueText, nextDasReminder } from '@/features/das/logic';
import { chargeMessage, type DebtEntry, groupDebtors } from '@/features/finance/debtors';
import { setupSteps } from '@/features/setup/logic';

const entry = (id: string, customer: string | null, open: number, due: string): DebtEntry => ({
  id,
  description: `Venda ${id}`,
  open_cents: open,
  due_date: due,
  status: 'pending',
  customer_id: customer,
  customer_name: customer ? `Cliente ${customer}` : null,
  order_number: null,
});

describe('groupDebtors', () => {
  it('junta por cliente, vencidos primeiro, depois o maior total, e sem cliente por último', () => {
    const list = groupDebtors(
      [
        entry('1', 'a', 5000, '2026-10-30'),
        entry('2', 'b', 1000, '2026-10-01'),
        entry('3', null, 9000, '2026-10-01'),
        entry('4', 'a', 2500, '2026-10-26'),
        entry('5', 'c', 8000, '2026-11-10'),
        { ...entry('6', 'c', 100, '2026-10-01'), status: 'cancelled' },
      ],
      '2026-10-24',
    );
    expect(list.map((d) => d.customerId)).toEqual(['b', 'c', 'a', null]);
    const a = list.find((d) => d.customerId === 'a')!;
    expect(a.totalCents).toBe(7500);
    expect(a.overdueCents).toBe(0);
    expect(a.oldestDue).toBe('2026-10-26');
    expect(a.entries.map((e) => e.id)).toEqual(['4', '1']);
    expect(list.find((d) => d.customerId === 'b')!.overdueCents).toBe(1000);
    expect(list[3]!.name).toBe('Sem cliente');
  });
});

describe('chargeMessage', () => {
  const now = new Date('2026-10-24T12:00:00');
  it('chama pelo primeiro nome, lista os valores e leva o Pix quando há', () => {
    const msg = chargeMessage({
      customerName: 'Maria Souza',
      orgName: 'Ana Ateliê',
      entries: [entry('1', 'a', 5000, '2026-10-30')],
      totalCents: 5000,
      pix: { keyLabel: 'Celular', key: '+5511988887777', code: 'CODIGO' },
      now,
    });
    expect(msg).toContain('Olá, Maria!');
    expect(msg).toContain('Ana Ateliê');
    expect(msg).toMatch(/R\$\s50,00/);
    expect(msg).toContain('venc. 30 out');
    expect(msg).toContain('Pix (Celular): +5511988887777');
    expect(msg).toContain('CODIGO');
  });

  it('sem Pix não fala de Pix e resume listas longas', () => {
    const entries = Array.from({ length: 7 }, (_, i) => entry(String(i), 'a', 100, '2026-10-30'));
    const msg = chargeMessage({ customerName: 'João', orgName: 'Loja', entries, totalCents: 700, now });
    expect(msg).not.toContain('Pix');
    expect(msg).toContain('e mais 2');
  });
});

describe('DAS', () => {
  it('a guia que vence em outubro é a de setembro, no dia 20', () => {
    const p = currentDasPeriod(new Date(2026, 9, 24, 10));
    expect(p).toMatchObject({ from: '2026-09-01', to: '2026-09-30', label: 'setembro', dueDate: '2026-10-20', overdue: true, key: '2026-09' });
    expect(dasDescription(p)).toBe('DAS de setembro/2026');
    expect(dasDueText(p)).toContain('Venceu');
  });

  it('em janeiro a guia é a de dezembro do ano anterior', () => {
    const p = currentDasPeriod(new Date(2027, 0, 5));
    expect(p).toMatchObject({ from: '2026-12-01', to: '2026-12-31', label: 'dezembro de 2026', dueDate: '2027-01-20', overdue: false, daysLeft: 15 });
    expect(dasDueText(p)).toBe('Vence dia 20, daqui a 15 dias.');
    expect(dasDueText(currentDasPeriod(new Date(2027, 0, 20)))).toBe('Vence hoje.');
  });

  it('lembra no dia 15 deste mês se a guia está aberta, senão no do mês que vem', () => {
    expect(nextDasReminder(false, new Date(2026, 9, 10))).toEqual(new Date(2026, 9, 15, 9, 0));
    expect(nextDasReminder(true, new Date(2026, 9, 10))).toEqual(new Date(2026, 10, 15, 9, 0));
    expect(nextDasReminder(false, new Date(2026, 9, 24))).toEqual(new Date(2026, 10, 15, 9, 0));
    expect(nextDasReminder(false, new Date(2026, 11, 20))).toEqual(new Date(2027, 0, 15, 9, 0));
  });
});

describe('setupSteps', () => {
  const none = { items: false, customer: false, first: false, pix: false, limit: false };

  it('fala a língua de cada negócio', () => {
    expect(setupSteps(getBusinessConfig('resale'), none).map((s) => s.title)).toEqual([
      'Cadastre o que você vende',
      'Cadastre um cliente',
      'Registre a primeira venda',
      'Informe sua chave Pix',
      'Cadastre o limite do MEI',
    ]);
    const clinic = setupSteps(getBusinessConfig('services', 'health'), none);
    expect(clinic[1]!.title).toBe('Cadastre um paciente');
    expect(clinic[2]).toMatchObject({ title: 'Marque o primeiro horário', route: '/horarios/novo' });
    expect(setupSteps(getBusinessConfig('production'), none)[2]!.title).toBe('Registre o primeiro pedido');
  });

  it('marca o que já existe', () => {
    const steps = setupSteps(getBusinessConfig('services'), { ...none, items: true, pix: true });
    expect(steps.filter((s) => s.done).map((s) => s.key)).toEqual(['items', 'pix']);
  });
});
