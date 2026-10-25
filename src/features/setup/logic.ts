// Primeiros passos na Início: o que cadastrar para o app começar a ajudar,
// na ordem que faz sentido para cada forma de trabalho. Cada passo some
// sozinho quando o dado existe no banco.

import type { BusinessConfig } from '@/config/business';

export type SetupStepKey = 'items' | 'customer' | 'first' | 'pix' | 'limit';

export interface SetupStatus {
  items: boolean;
  customer: boolean;
  first: boolean;
  pix: boolean;
  limit: boolean;
}

export interface SetupStep {
  key: SetupStepKey;
  title: string;
  description: string;
  route: string;
  done: boolean;
}

export function setupSteps(config: BusinessConfig, status: SetupStatus): SetupStep[] {
  const { profile, orderNoun, clientNoun } = config;
  const items =
    profile === 'production'
      ? { title: 'Cadastre seus produtos', description: 'O que você faz e vende, com o preço. Depois dá para montar a receita e saber o custo.' }
      : profile === 'resale'
        ? { title: 'Cadastre o que você vende', description: 'Produto, preço e quantos você tem. O app mostra quando estiver acabando.' }
        : profile === 'appointments'
          ? { title: 'Cadastre seus serviços', description: 'Nome, preço e quanto tempo dura. A agenda usa a duração para marcar.' }
          : { title: 'Cadastre seus serviços', description: 'O que você faz e quanto cobra. Também dá para cadastrar os materiais.' };
  const first =
    profile === 'appointments'
      ? { title: 'Marque o primeiro horário', description: `Escolha o ${clientNoun}, o serviço, o dia e a hora.`, route: '/horarios/novo' }
      : {
          title: `Registre ${orderNoun === 'venda' ? 'a primeira' : 'o primeiro'} ${orderNoun}`,
          description: 'Com prazo e valor. O app avisa quando estiver perto de atrasar.',
          route: '/pedidos/novo',
        };
  return [
    { key: 'items', ...items, route: '/itens/form', done: status.items },
    {
      key: 'customer',
      title: `Cadastre ${clientNoun === 'paciente' ? 'um paciente' : 'um cliente'}`,
      description: 'Nome e WhatsApp. Assim você manda lembrete e cobrança com um toque.',
      route: '/clientes/form',
      done: status.customer,
    },
    { key: 'first', ...first, done: status.first },
    {
      key: 'pix',
      title: 'Informe sua chave Pix',
      description: 'Vai junto da cobrança, com o Pix copia e cola já com o valor.',
      route: '/pix',
      done: status.pix,
    },
    {
      key: 'limit',
      title: 'Cadastre o limite do MEI',
      description: 'O app soma o que você faturou no ano e avisa antes de passar do limite.',
      route: '/financeiro/mei',
      done: status.limit,
    },
  ];
}
