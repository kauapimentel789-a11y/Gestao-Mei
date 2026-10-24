import { BUSINESS_CONFIG, BUSINESS_TYPES } from '@/config/business';

describe('configuração por tipo de negócio', () => {
  it.each(BUSINESS_TYPES)('%s tem 5 abas começando por Início e terminando em Financeiro', (type) => {
    const { tabs } = BUSINESS_CONFIG[type];
    expect(tabs).toHaveLength(5);
    expect(tabs[0]).toBe('inicio');
    expect(tabs[4]).toBe('financeiro');
  });

  it('adapta os rótulos ao modelo', () => {
    expect(BUSINESS_CONFIG.production.tabLabels.tarefas).toBe('Produção');
    expect(BUSINESS_CONFIG.resale.tabLabels.pedidos).toBe('Vendas');
    expect(BUSINESS_CONFIG.services.tabLabels.pedidos).toBe('Serviços');
  });

  it('serviços usa Agenda no lugar de Estoque', () => {
    expect(BUSINESS_CONFIG.services.tabs).toContain('agenda');
    expect(BUSINESS_CONFIG.services.tabs).not.toContain('estoque');
  });
});
