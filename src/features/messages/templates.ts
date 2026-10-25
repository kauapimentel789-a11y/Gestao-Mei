// Mensagens prontas para o cliente, uma para cada etapa do pedido ou
// atendimento. O app abre o WhatsApp com o texto; quem envia é a pessoa.
import type { BusinessProfile, OrderStatus } from '@/config/business';
import { whenPhrase } from '@/features/agenda/logic';
import { formatCents } from '@/lib/money';

export type NoticeEvent =
  | 'created'
  | Exclude<OrderStatus, 'received'>
  | 'rescheduled'
  | 'unscheduled'
  | 'no_show'
  | 'payment';

export interface NoticeContext {
  profile: BusinessProfile;
  business: string;
  /** "pedido", "venda", "serviço", "atendimento". */
  noun: string;
  number: number;
  customerName: string | null;
  totalCents: number;
  /** Primeiros itens, para o resumo do pedido. */
  items: string[];
  dueAt: Date | null;
  scheduledFor: Date | null;
  /** Valor ainda em aberto (do banco). */
  openCents: number;
  /** Valor recebido agora, no aviso de pagamento. */
  paidCents?: number;
  /** Pix copia e cola no valor em aberto, quando a empresa tem chave. */
  pix?: { keyLabel: string; key: string; code: string } | null;
  now?: Date;
}

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] ?? '';

function itemsSummary(items: string[]): string {
  if (items.length === 0) return '';
  const shown = items.slice(0, 3).join(', ');
  return items.length > 3 ? `${shown} e mais ${items.length - 3}` : shown;
}

function pixLines(c: NoticeContext): string {
  if (c.openCents <= 0) return '';
  const base = `\n\nFalta pagar ${formatCents(c.openCents)}.`;
  if (!c.pix) return base;
  return `${base} Pix (${c.pix.keyLabel}): ${c.pix.key}\nOu copie e cole no app do banco:\n${c.pix.code}`;
}

/** Texto da mensagem; null quando a etapa não pede aviso (ex.: horário sem data). */
export function noticeText(event: NoticeEvent, c: NoticeContext): string | null {
  const name = firstName(c.customerName);
  const hello = `Olá${name ? `, ${name}` : ''}!`;
  // "venda" é feminino: "sua venda está pronta".
  const fem = c.noun === 'venda';
  const g = (m: string, f: string) => (fem ? f : m);
  const ref = `${g('seu', 'sua')} ${c.noun} #${c.number}`;
  const when = c.scheduledFor ? whenPhrase(c.scheduledFor, c.now) : null;
  const visit = c.profile === 'appointments';
  const service = c.profile === 'services' || visit;
  const reply = 'Qualquer dúvida, é só responder aqui.';

  switch (event) {
    case 'created': {
      if (visit) {
        if (!when) return null;
        const what = itemsSummary(c.items);
        return `${hello} Seu horário na ${c.business} está marcado para ${when}${what ? ` (${what})` : ''}. Se precisar remarcar, é só me avisar por aqui.`;
      }
      const lines = [`${hello} Recebemos ${ref} na ${c.business}.`];
      const summary = itemsSummary(c.items);
      if (summary) lines.push(`Itens: ${summary}.`);
      if (c.totalCents > 0) lines.push(`Total: ${formatCents(c.totalCents)}.`);
      if (when) lines.push(`Agendado para ${when}.`);
      else if (c.dueAt) lines.push(`Previsão: ${whenPhrase(c.dueAt, c.now)}.`);
      lines.push(reply);
      return lines.join(' ');
    }
    case 'confirmed':
      if (visit) return when ? `${hello} Seu horário na ${c.business} está confirmado para ${when}. Até lá!` : null;
      if (service && when) return `${hello} ${capitalize(ref)} na ${c.business} está ${g('agendado', 'agendada')} para ${when}. ${reply}`;
      return `${hello} ${capitalize(ref)} na ${c.business} está ${g('confirmado', 'confirmada')} e já vamos cuidar ${g('dele', 'dela')}. ${reply}`;
    case 'in_progress':
      if (visit) return null;
      if (c.profile === 'resale') return `${hello} Já estamos separando ${ref} na ${c.business}. Aviso assim que estiver ${g('pronto', 'pronta')}.`;
      if (service) return `${hello} Começamos ${ref} na ${c.business}. Aviso quando terminar.`;
      return `${hello} ${capitalize(ref)} na ${c.business} já está em produção. Aviso assim que ficar ${g('pronto', 'pronta')}.`;
    case 'completed':
      if (visit) return null;
      if (service) return `${hello} ${capitalize(ref)} na ${c.business} foi ${g('concluído', 'concluída')}.${pixLines(c)}\n\n${reply}`;
      return `${hello} ${capitalize(ref)} na ${c.business} está ${g('pronto', 'pronta')}! Podemos combinar a retirada ou a entrega?${pixLines(c)}`;
    case 'delivered':
      if (visit) return `${hello} Obrigado pela visita à ${c.business}. Foi um prazer atender você!${pixLines(c)}`;
      if (service) return `${hello} Obrigado pela confiança na ${c.business}! Se puder, conta pra gente o que achou do serviço.${pixLines(c)}`;
      return `${hello} Obrigado por comprar com a ${c.business}! Se puder, conta pra gente o que achou.${pixLines(c)}`;
    case 'cancelled':
      if (visit) return `${hello} Seu horário${when ? ` marcado para ${when}` : ''} na ${c.business} foi cancelado. Quer marcar outro dia?`;
      return `${hello} ${capitalize(ref)} na ${c.business} foi ${g('cancelado', 'cancelada')}. Se quiser refazer ou tirar alguma dúvida, é só responder aqui.`;
    case 'rescheduled':
      if (!when) return null;
      if (visit) return `${hello} Seu horário na ${c.business} foi remarcado para ${when}. Pode ser?`;
      return `${hello} ${capitalize(ref)} na ${c.business} foi ${g('reagendado', 'reagendada')} para ${when}. Pode ser?`;
    case 'unscheduled':
      return `${hello} Tiramos da agenda a data de ${ref} na ${c.business}. Vamos combinar um novo dia?`;
    case 'no_show':
      return `${hello} Sentimos sua falta no seu horário na ${c.business}. Quer marcar um novo horário?`;
    case 'payment':
      if (!c.paidCents) return null;
      return `${hello} Recebemos seu pagamento de ${formatCents(c.paidCents)} ${g('referente ao', 'referente à')} ${ref} na ${c.business}. Muito obrigado!`;
  }
}

function capitalize(s: string) {
  return s[0]!.toUpperCase() + s.slice(1);
}

const NOTICE_TITLE: Record<NoticeEvent, string> = {
  created: 'Avisar que foi registrado',
  confirmed: 'Avisar a confirmação',
  in_progress: 'Avisar que começou',
  completed: 'Avisar que está pronto',
  delivered: 'Agradecer',
  cancelled: 'Avisar o cancelamento',
  rescheduled: 'Avisar a nova data',
  unscheduled: 'Avisar que saiu da agenda',
  no_show: 'Chamar para remarcar',
  payment: 'Enviar comprovante',
};

export function noticeTitle(event: NoticeEvent, profile: BusinessProfile): string {
  if (event === 'created' && profile === 'appointments') return 'Confirmar o horário';
  return NOTICE_TITLE[event];
}

/** Etapa do pedido que pede aviso ao cliente quando o status muda. */
export function statusEvent(status: OrderStatus): NoticeEvent | null {
  return status === 'received' ? null : status;
}
