import { scrubEvent, scrubUrl } from '@/lib/monitoring';

jest.mock('@sentry/react-native', () => ({}));

describe('monitor de erros', () => {
  it('tira busca, fragmento e o código do link do cliente', () => {
    expect(scrubUrl('https://x.app/horario/abc123?x=1')).toBe('https://x.app/horario/[codigo]');
    expect(scrubUrl('https://db.supabase.co/rest/v1/customers?phone=eq.11999')).toBe('https://db.supabase.co/rest/v1/customers');
    expect(scrubUrl('https://x.app/nova-senha#access_token=a&refresh_token=r')).toBe('https://x.app/nova-senha');
  });

  it('remove usuário, cabeçalhos e corpos', () => {
    const event = scrubEvent({
      user: { email: 'ana@example.com' },
      request: { url: 'https://x.app/horario/abc?y=2', headers: { authorization: 'Bearer t' }, data: '{"senha":"x"}' },
      breadcrumbs: [{ data: { url: 'https://db/rest/v1/orders?id=eq.1', body: 'segredo' } }],
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: 'https://x.app/horario/[codigo]' });
    expect(event.breadcrumbs?.[0]?.data).toEqual({ url: 'https://db/rest/v1/orders' });
  });
});
