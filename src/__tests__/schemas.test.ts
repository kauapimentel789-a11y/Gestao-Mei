import { signUpSchema } from '@/features/auth/schemas';
import { parseAuthFragment } from '@/features/auth/recovery';
import { createOrganizationSchema } from '@/features/organizations/schemas';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('schemas', () => {
  it('cadastro exige senha de 8+ caracteres e e-mail válido', () => {
    expect(signUpSchema.safeParse({ name: 'Ana', email: 'ana@x.com', password: '12345678' }).success).toBe(true);
    expect(signUpSchema.safeParse({ name: 'Ana', email: 'ana@x.com', password: '123' }).success).toBe(false);
    expect(signUpSchema.safeParse({ name: 'Ana', email: 'ana', password: '12345678' }).success).toBe(false);
  });

  it('criar empresa valida tipo, slug e valor da hora', () => {
    const ok = { name: 'Ana Ateliê', businessType: 'production', slug: 'ana-atelie', hourlyRate: '25,00' };
    expect(createOrganizationSchema.safeParse(ok).success).toBe(true);
    expect(createOrganizationSchema.safeParse({ ...ok, hourlyRate: '' }).success).toBe(true);
    expect(createOrganizationSchema.safeParse({ ...ok, businessType: 'outro' }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ ...ok, slug: 'Ana Ateliê' }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ ...ok, hourlyRate: 'abc' }).success).toBe(false);
  });
});

describe('parseAuthFragment', () => {
  it('lê os tokens do link de recuperação', () => {
    const url = 'gestaofacil://nova-senha#access_token=a&refresh_token=r&type=recovery';
    expect(parseAuthFragment(url)).toEqual({ accessToken: 'a', refreshToken: 'r', type: 'recovery' });
  });

  it('ignora links sem tokens', () => {
    expect(parseAuthFragment('gestaofacil://nova-senha')).toBeNull();
    expect(parseAuthFragment('gestaofacil://x#type=recovery')).toBeNull();
  });
});
