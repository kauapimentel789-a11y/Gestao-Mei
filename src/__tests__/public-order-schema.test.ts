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
    expect(r.success && r.data.slug).toBe('ana-atelie');
  });

  it('recusa campos fora do contrato', () => {
    expect(orderRequest.safeParse({ ...valid, items: [] }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, items: [{ ...valid.items[0], quantity: 1.5 }] }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, phone: '1234' }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, name: 'C' }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, due_date: '02/11/2026' }).success).toBe(false);
    expect(orderRequest.safeParse({ ...valid, idempotency_key: 'x' }).success).toBe(false);
    expect(publicRequest.safeParse({ action: 'storefront', slug: '../x' }).success).toBe(false);
  });

  it('o preço do cliente não passa pelo contrato', () => {
    const r = orderRequest.safeParse({ ...valid, items: [{ ...valid.items[0], unit_price_cents: 1 }] });
    expect(r.success && 'unit_price_cents' in r.data.items[0]!).toBe(false);
  });

  it('erros conhecidos têm mensagem e status', () => {
    expect(PUBLIC_ERRORS.rate_limited!.status).toBe(429);
    expect(PUBLIC_ERRORS.not_found!.status).toBe(404);
  });
});
