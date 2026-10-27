import { inviteMessage, memberName, normalizeEmail } from '@/features/family/logic';

describe('família', () => {
  it('confere o e-mail', () => {
    expect(normalizeEmail('  Bruno@Example.com ')).toBe('bruno@example.com');
    expect(normalizeEmail('bruno@')).toBeNull();
    expect(normalizeEmail('sem arroba.com')).toBeNull();
  });

  it('mostra um nome para a pessoa', () => {
    expect(memberName({ display_name: 'Ana Souza', email: 'ana@x.com' })).toBe('Ana Souza');
    expect(memberName({ display_name: ' ', email: 'bruno@x.com' })).toBe('bruno');
  });

  it('monta a mensagem do convite', () => {
    expect(inviteMessage('Ana', 'bruno@x.com', 'https://app.example')).toBe(
      'Ana te convidou para dividir as finanças da casa no Gestão Fácil. Entre em https://app.example e crie sua conta com o e-mail bruno@x.com: o convite aparece logo no começo.',
    );
    expect(inviteMessage('', 'b@x.com', 'https://a')).toMatch(/^Você foi convidado/);
  });
});
