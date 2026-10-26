import { birthdayText, type NoticeContext, noticeText, noticeTitle, statusEvent } from '@/features/messages/templates';

const now = new Date(2026, 10, 9, 10, 0); // segunda, 09/11/2026

const base: NoticeContext = {
  profile: 'production',
  business: 'Ana Ateliê',
  noun: 'pedido',
  number: 12,
  customerName: 'Maria Souza',
  totalCents: 15000,
  items: ['Vela aromática', 'Sabonete'],
  dueAt: new Date(2026, 10, 10, 14, 0),
  scheduledFor: null,
  openCents: 15000,
  now,
};

describe('noticeText', () => {
  it('confirma o pedido com itens, total e previsão', () => {
    const t = noticeText('created', base)!;
    expect(t).toContain('Olá, Maria! Recebemos seu pedido #12 na Ana Ateliê.');
    expect(t).toContain('Itens: Vela aromática, Sabonete.');
    expect(t).toMatch(/Total: R\$\s150,00\./);
    expect(t).toContain('Previsão: amanhã (terça, 10/11) às 14:00.');
  });

  it('confirma o horário marcado em atendimentos', () => {
    const ctx = { ...base, profile: 'appointments' as const, noun: 'atendimento', items: ['Limpeza'], scheduledFor: new Date(2026, 10, 9, 15, 30) };
    expect(noticeText('created', ctx)).toBe(
      'Olá, Maria! Seu horário na Ana Ateliê está marcado para hoje às 15:30 (Limpeza). Se precisar remarcar, é só me avisar por aqui.',
    );
    expect(noticeTitle('created', 'appointments')).toBe('Confirmar o horário');
    expect(noticeText('created', { ...ctx, scheduledFor: null })).toBeNull();
    expect(noticeText('in_progress', ctx)).toBeNull();
  });

  it('pronto leva o valor em aberto e o Pix copia e cola', () => {
    const t = noticeText('completed', { ...base, openCents: 5000, pix: { keyLabel: 'Celular', key: '+5511988887777', code: 'CODIGO' } })!;
    expect(t).toContain('está pronto!');
    expect(t).toMatch(/Falta pagar R\$\s50,00\./);
    expect(t).toContain('Pix (Celular): +5511988887777');
    expect(t).toContain('CODIGO');
    expect(noticeText('completed', { ...base, openCents: 0 })).not.toContain('Falta pagar');
  });

  it('cada negócio fala do seu jeito', () => {
    expect(noticeText('in_progress', { ...base, profile: 'resale', noun: 'venda' })).toContain('separando sua venda #12');
    expect(noticeText('in_progress', base)).toContain('em produção');
    const service = { ...base, profile: 'services' as const, noun: 'serviço', scheduledFor: new Date(2026, 10, 12, 9, 0) };
    expect(noticeText('confirmed', service)).toContain('agendado para quinta, 12/11, às 09:00');
    expect(noticeText('delivered', base)).toContain('Obrigado por comprar');
    expect(noticeText('completed', { ...base, profile: 'resale', noun: 'venda', openCents: 0 })).toContain('Sua venda #12 na Ana Ateliê está pronta!');
  });

  it('remarcação, falta, cancelamento e pagamento', () => {
    const ctx = { ...base, profile: 'appointments' as const, scheduledFor: new Date(2026, 10, 10, 8, 0) };
    expect(noticeText('rescheduled', ctx)).toContain('remarcado para amanhã (terça, 10/11) às 08:00');
    expect(noticeText('rescheduled', { ...ctx, scheduledFor: null })).toBeNull();
    expect(noticeText('no_show', ctx)).toContain('Sentimos sua falta');
    expect(noticeText('cancelled', ctx)).toContain('Quer marcar outro dia?');
    expect(noticeText('payment', { ...base, paidCents: 7000 })).toMatch(/Recebemos seu pagamento de R\$\s70,00 referente ao seu pedido #12/);
    expect(noticeText('payment', base)).toBeNull();
  });

  it('sem nome do cliente fica só "Olá!" e resume listas longas', () => {
    const t = noticeText('created', { ...base, customerName: null, items: ['a', 'b', 'c', 'd', 'e'] })!;
    expect(t.startsWith('Olá! ')).toBe(true);
    expect(t).toContain('a, b, c e mais 2');
  });
});

describe('statusEvent', () => {
  it('só não avisa a etapa inicial', () => {
    expect(statusEvent('received')).toBeNull();
    expect(statusEvent('completed')).toBe('completed');
  });
});

describe('birthdayText', () => {
  it('dá parabéns no dia', () => {
    expect(birthdayText({ profile: 'production', business: 'Doce Ana', customerName: 'Maria Souza', daysUntil: 0 })).toBe(
      'Feliz aniversário, Maria! A Doce Ana deseja um dia muito especial para você. Se quiser comemorar com um docinho ou uma encomenda especial, é só chamar aqui.',
    );
  });

  it('convida para encomendar antes do dia', () => {
    expect(birthdayText({ profile: 'production', business: 'Doce Ana', customerName: 'Maria', daysUntil: 5 })).toContain('garantir sua encomenda');
    expect(birthdayText({ profile: 'appointments', business: 'Studio', customerName: 'Bia', daysUntil: 3 })).toContain('marcar um horário');
  });
});
