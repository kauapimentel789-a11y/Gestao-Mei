import { BUSINESS_CONFIG, BUSINESS_PROFILES, BUSINESS_TYPES, getBusinessConfig, profileToDb } from '@/config/business';

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

  it('tipo de registro e status adaptados', () => {
    expect(BUSINESS_CONFIG.production.orderKind).toBe('order');
    expect(BUSINESS_CONFIG.resale.orderKind).toBe('sale');
    expect(BUSINESS_CONFIG.services.orderKind).toBe('service_order');
    expect(BUSINESS_CONFIG.services.statusLabels.confirmed).toBe('Agendado');
    expect(BUSINESS_CONFIG.resale.statusLabels.in_progress).toBe('Separando');
  });
});

describe('atendimentos com hora marcada', () => {
  it('é serviço no banco, com agenda e clientes nas abas', () => {
    const cfg = getBusinessConfig('services', 'professional');
    expect(cfg.profile).toBe('appointments');
    expect(cfg.type).toBe('services');
    expect(cfg.tabs).toEqual(['inicio', 'agenda', 'clientes', 'tarefas', 'financeiro']);
    expect(cfg.orderKind).toBe('service_order');
    expect(cfg.clientsLabel).toBe('Clientes');
  });

  it('saúde chama de pacientes', () => {
    const cfg = getBusinessConfig('services', 'health');
    expect(cfg.clientNoun).toBe('paciente');
    expect(cfg.tabLabels.clientes).toBe('Pacientes');
    expect(BUSINESS_CONFIG.appointments.clientNoun).toBe('cliente');
  });

  it('vai de agendado a atendido', () => {
    const cfg = getBusinessConfig('services', 'beauty');
    expect(cfg.statusFlow).toEqual(['received', 'confirmed', 'delivered']);
    expect(cfg.statusLabels.received).toBe('Agendado');
    expect(cfg.statusLabels.delivered).toBe('Atendido');
  });

  it('sem área continua sendo ordem de serviço', () => {
    expect(getBusinessConfig('services', null).profile).toBe('services');
    expect(getBusinessConfig('production', 'health').profile).toBe('production');
  });

  it('grava tipo e área certos no cadastro', () => {
    expect(profileToDb('appointments', 'health')).toEqual({ type: 'services', practiceArea: 'health' });
    expect(profileToDb('appointments', null)).toEqual({ type: 'services', practiceArea: 'other' });
    expect(profileToDb('resale', 'health')).toEqual({ type: 'resale', practiceArea: null });
  });

  it('todas as opções do cadastro têm 5 abas', () => {
    for (const p of BUSINESS_PROFILES) expect(BUSINESS_CONFIG[p].tabs).toHaveLength(5);
  });
});
