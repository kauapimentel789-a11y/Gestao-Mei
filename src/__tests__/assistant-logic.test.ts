import { type ChatMessage, historyForRequest, MAX_HISTORY, proposalToEntry, remainingLabel } from '@/features/assistant/logic';
import { joinTranscript } from '@/features/assistant/useDictation';

const msg = (i: number, text = `m${i}`): ChatMessage => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', text });

describe('historyForRequest', () => {
  it('manda só as últimas mensagens, sem as vazias', () => {
    const list = Array.from({ length: 30 }, (_, i) => msg(i));
    list.push({ id: 'x', role: 'assistant', text: '  ' });
    const out = historyForRequest(list);
    expect(out).toHaveLength(MAX_HISTORY);
    expect(out[out.length - 1]).toEqual({ role: 'assistant', text: 'm29' });
  });

  it('corta texto muito longo', () => {
    expect(historyForRequest([msg(0, 'a'.repeat(5000))])[0]!.text).toHaveLength(2000);
  });
});

describe('proposalToEntry', () => {
  const base = {
    direction: 'payable' as const,
    description: 'Mercado',
    amount_cents: 5000,
    category_id: 'cat',
    category_name: 'Mercado',
    date: '2026-10-27',
    paid: true,
    account_id: 'acc',
    account_name: 'Conta do banco',
  };

  it('já pago registra a baixa na conta', () => {
    expect(proposalToEntry(base, 'k')).toMatchObject({
      amountCents: 5000,
      dueDate: '2026-10-27',
      competenceDate: '2026-10-27',
      idempotencyKey: 'k',
      paid: { accountId: 'acc', method: 'other', paidOn: '2026-10-27' },
    });
  });

  it('a pagar fica sem baixa', () => {
    expect(proposalToEntry({ ...base, paid: false, account_id: null }, 'k').paid).toBeNull();
  });
});

describe('remainingLabel', () => {
  it('só avisa quando faltam poucas', () => {
    expect(remainingLabel(20)).toBeNull();
    expect(remainingLabel(3)).toBe('Restam 3 perguntas hoje.');
    expect(remainingLabel(1)).toBe('Resta 1 pergunta hoje.');
    expect(remainingLabel(0)).toBe('Esta foi a última pergunta de hoje.');
  });
});

describe('joinTranscript', () => {
  it('junta os trechos falados', () => {
    expect(joinTranscript([[{ transcript: 'gastei 40' }], [{ transcript: '  no mercado ' }]])).toBe('gastei 40 no mercado');
  });
});
