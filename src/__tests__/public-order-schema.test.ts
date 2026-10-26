import { orderRequest, PUBLIC_ERRORS, publicRequest } from '../../supabase/functions/_shared/public-order';

const valid = {
  action: 'order',
  slug: 'ana-atelie',
  idempotency_key: '7d3f1c3e-6a1b-4c1e-9f7a-2b8c4d5e6f70',
  name: 'Carla',
  phone: '(11) 98888-7777',
  due_date: '2026-11-02',
  notes: null,
  items: [{ product_id: '0b9c6a52-8f0e-4b8a-9d55-3f4b1a2c3d4e', quantity: 2 }],
};

describe('contrato do link de encomenda', () => {
  it('aceita um pedido válido e normaliza o slug', () => {
    const r = publicRequest.safeParse({ ...valid, slug: ' Ana-Atelie ' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.action === 'order' && r.data.slug).toBe('ana-atelie');
  });

  it('recusa campos fora do contrato', () => {
    expect(orderRequest.safeParse({ ...valid, items: [] }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, items: [{ ...valid.items[0], quantity: 1.2345 }] }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, items: [{ ...valid.items[0], quantity: 0.05 }] }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, phone: '1234' }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, name: 'C' }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, due_date: '02/11/2026' }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, idempotency_key: 'x' }).success).toBe(false);
    expect(publicRequest.safeParse({ action: 'storefront', slug: '../x' }).success).toBe(false);
  });

  it('aceita peso em kg e entrega com endereço', () => {
    expect(orderRequest.safeParse({ ...valid, items: [{ ...valid.items[0], quantity: 1.25 }] }).success).toBe(true);
    const zone = '5a1d2f3e-4b5c-4d6e-8f70-81a2b3c4d5e6';
    expect(orderRequest.safeParse({ ...valid, delivery_zone_id: zone, address: 'Rua A, 10' }).success).toBe(true);
    expect(orderRequest.safeParse({ ...valid, delivery_zone_id: zone, address: '' }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, delivery_zone_id: null, address: null }).success).toBe(true);
  });

  it('o preço do cliente não passa pelo contrato', () => {
    const r = orderRequest.safeParse({ ...valid, items: [{ ...valid.items[0], unit_price_cents: 1 }] });
    expect(r.success && 'unit_price_cents' in r.data.items[0]!).toBe(false);
  });

  it('erros conhecidos têm mensagem e status', () => {
    expect(PUBLIC_ERRORS.rate_limited!.status).toBe(429);
    expect(PUBLIC_ERRORS.not_found!.status).toBe(404);
  });

  it('link do cliente só aceita o código de 64 caracteres', () => {
    const token = 'a'.repeat(64);
    expect(publicRequest.safeParse({ action: 'booking_manage', token }).success).toBe(true);
    expect(publicRequest.safeParse({ action: 'booking_cancel', token: 'A'.repeat(64) }).success).toBe(false);
    expect(publicRequest.safeParse({ action: 'booking_cancel', token: 'a'.repeat(63) }).success).toBe(false);
    expect(publicRequest.safeParse({ action: 'booking_manage_slots', token, day: '2026-11-02' }).success).toBe(true);
    expect(publicRequest.safeParse({ action: 'booking_reschedule', token, starts_at: '2026-11-02T11:00:00Z' }).success).toBe(true);
    expect(publicRequest.safeParse({ action: 'booking_reschedule', token, starts_at: 'amanhã' }).success).toBe(false);
  });
});
