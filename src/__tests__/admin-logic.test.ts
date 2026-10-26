import { bucketLabel, businessLabel, formatDate, growthPercent, percentOf } from '@/features/admin/logic';

describe('painel do dono', () => {
  it('variação contra o período anterior', () => {
    expect(growthPercent(15, 10)).toBe(50);
    expect(growthPercent(5, 10)).toBe(-50);
    expect(growthPercent(3, 0)).toBeNull();
  });

  it('rótulos da série', () => {
    expect(bucketLabel('2026-10-26', false)).toBe('26/10');
    expect(bucketLabel('2026-01-01', true)).toBe('jan/26');
  });

  it('tipo de negócio', () => {
    expect(businessLabel('services', 'health')).toBe('Atendimentos');
    expect(businessLabel('services', null)).toBe('Serviços');
    expect(businessLabel(null, null)).toBe('Sem empresa');
  });

  it('porcentagem e data', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(1, 0)).toBe(0);
    expect(formatDate('2026-11-05')).toBe('05/11/2026');
  });
});
