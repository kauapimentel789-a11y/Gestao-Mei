import { friendlyError, isSessionLost, SESSION_LOST_MESSAGE } from '@/lib/errors';

describe('friendlyError', () => {
  it('explica quando o login caiu (pedido chegou sem login)', () => {
    const e = { code: '42501', message: 'permission denied for function create_organization' };
    expect(isSessionLost(e)).toBe(true);
    expect(friendlyError(e)).toBe(SESSION_LOST_MESSAGE);
  });

  it('JWT vencido também conta como login perdido', () => {
    expect(isSessionLost({ code: 'PGRST303', message: 'JWT expired' })).toBe(true);
  });

  it('não confunde com erros de regra de negócio', () => {
    expect(isSessionLost({ message: 'slug_taken' })).toBe(false);
    expect(friendlyError({ message: 'slug_taken' })).toBe('Esse link já está em uso. Escolha outro.');
  });
});
