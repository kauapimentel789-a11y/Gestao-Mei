import { LATE_PREFIX, MAX_ALERTS, planLateAlerts } from '@/features/alerts/logic';

const now = new Date('2026-10-24T12:00:00Z');
const order = (id: string, due: string | null, status = 'received' as const, customer: string | null = 'Carla') => ({
  id,
  number: Number(id),
  status,
  due_at: due,
  customer_name: customer,
});

describe('planLateAlerts', () => {
  it('agenda só pedidos em aberto com prazo no futuro, do mais próximo ao mais distante', () => {
    const plan = planLateAlerts(
      [
        order('1', '2026-10-25T12:00:00Z'),
        order('2', '2026-10-24T11:00:00Z'),
        order('3', null),
        { ...order('4', '2026-10-24T13:00:00Z'), status: 'delivered' as const },
        order('5', '2026-10-24T15:00:00Z', 'received', null),
      ],
      'pedido',
      now,
    );
    expect(plan.map((a) => a.orderId)).toEqual(['5', '1']);
    expect(plan[0]).toMatchObject({ identifier: `${LATE_PREFIX}5`, title: 'Pedido #5 atrasado', body: 'O prazo venceu agora. Toque para ver.' });
    expect(plan[1]!.body).toContain('Carla');
    expect(plan[1]!.date.toISOString()).toBe('2026-10-25T12:00:00.000Z');
  });

  it('respeita o limite de avisos agendados', () => {
    const many = Array.from({ length: 80 }, (_, i) => order(String(i + 1), new Date(now.getTime() + (i + 1) * 60000).toISOString()));
    expect(planLateAlerts(many, 'venda', now)).toHaveLength(MAX_ALERTS);
    expect(planLateAlerts(many, 'venda', now)[0]!.title).toBe('Venda #1 atrasado');
  });
});
