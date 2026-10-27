import { filterByDirection, personalAllows, personalInsight, savingsPct } from '@/features/personal/logic';

describe('Minhas finanças', () => {
  const list = [
    { id: 'a', direction: 'payable' as const },
    { id: 'b', direction: 'receivable' as const },
    { id: 'c', direction: 'payable' as const },
  ];

  it('filtra gastos e entradas', () => {
    expect(filterByDirection(list, 'all')).toHaveLength(3);
    expect(filterByDirection(list, 'out').map((e) => e.id)).toEqual(['a', 'c']);
    expect(filterByDirection(list, 'in').map((e) => e.id)).toEqual(['b']);
  });

  it('calcula quanto da renda sobrou', () => {
    expect(savingsPct(300000, 225000)).toBe(25);
    expect(savingsPct(300000, 400000)).toBe(-33.3);
    expect(savingsPct(0, 1000)).toBeNull();
  });

  it('escreve o resumo do mês', () => {
    expect(personalInsight({ inCents: 0, outCents: 0 })).toMatch(/Nada lançado/);
    const text = personalInsight({
      inCents: 300000,
      outCents: 225000,
      prevOutCents: 250000,
      top: { key: 'm', name: 'Mercado', cents: 90000, pct: 40 },
    });
    expect(text).toContain('sobraram R$');
    expect(text).toContain('25%');
    expect(text).toContain('10% abaixo do mês passado');
    expect(text).toContain('O maior gasto é Mercado (40%)');
    expect(personalInsight({ inCents: 100000, outCents: 150000 })).toMatch(/saiu R\$\s?500,00 a mais/);
    expect(personalInsight({ inCents: 0, outCents: 5000 })).toMatch(/saíram R\$\s?50,00/);
  });

  it('sabe quais telas existem no pessoal', () => {
    for (const p of ['/', '/financeiro', '/contas', '/financeiro/lancamento', '/financeiro/categorias', '/financeiro/abc-123', '/configuracoes/', '/cartoes', '/a-pagar', '/cartao/abc', '/financeiro/parcelado', '/orcamento', '/metas', '/meta/abc', '/financeiro/relatorios', '/familia', '/assistente']) {
      expect(personalAllows(p)).toBe(true);
    }
    for (const p of ['/pedidos', '/pedidos/novo', '/financeiro/mei', '/financeiro/venda-rapida', '/clientes', '/estoque', '/financeiro/a/b', '/cartao', '/cartao/a/b', '/meta']) {
      expect(personalAllows(p)).toBe(false);
    }
  });
});
