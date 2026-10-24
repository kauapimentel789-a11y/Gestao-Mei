import { formatDateBR, formatTimeBR, parseDateTimeBR } from '@/lib/dates';
import { whatsappUrl } from '@/lib/whatsapp';
import { isLowStock, marginRatio } from '@/features/products/types';

describe('parseDateTimeBR', () => {
  it('lê data e hora', () => {
    const d = parseDateTimeBR('25/10/2026', '15:30')!;
    expect(formatDateBR(d)).toBe('25/10/2026');
    expect(formatTimeBR(d)).toBe('15:30');
  });
  it('hora vazia vira meio-dia', () => {
    expect(formatTimeBR(parseDateTimeBR('01/11/2026')!)).toBe('12:00');
  });
  it('recusa datas que não existem', () => {
    expect(parseDateTimeBR('31/02/2026')).toBeNull();
    expect(parseDateTimeBR('2026-10-25')).toBeNull();
    expect(parseDateTimeBR('25/10/2026', '25:00')).toBeNull();
  });
});

describe('whatsappUrl', () => {
  it('adiciona 55 a números brasileiros', () => {
    expect(whatsappUrl('11982341120')).toBe('https://wa.me/5511982341120');
    expect(whatsappUrl('5511982341120', 'Oi')).toBe('https://wa.me/5511982341120?text=Oi');
  });
  it('ignora números curtos', () => {
    expect(whatsappUrl('98234')).toBeNull();
  });
});

describe('itens', () => {
  it('estoque baixo só quando controla estoque e tem mínimo', () => {
    expect(isLowStock({ track_stock: true, stock_qty: '2.000', min_stock: '3.000' })).toBe(true);
    expect(isLowStock({ track_stock: true, stock_qty: '3.000', min_stock: '3.000' })).toBe(true);
    expect(isLowStock({ track_stock: true, stock_qty: '4.000', min_stock: '3.000' })).toBe(false);
    expect(isLowStock({ track_stock: true, stock_qty: '0.000', min_stock: '0.000' })).toBe(false);
    expect(isLowStock({ track_stock: false, stock_qty: '0.000', min_stock: '3.000' })).toBe(false);
  });
  it('margem sobre o preço', () => {
    expect(marginRatio({ cost_cents: 1850, price_cents: 4990 })).toBeCloseTo(0.629, 3);
    expect(marginRatio({ cost_cents: null, price_cents: 4990 })).toBeNull();
    expect(marginRatio({ cost_cents: 100, price_cents: 0 })).toBeNull();
  });
});
