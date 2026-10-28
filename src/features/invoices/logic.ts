// Nota fiscal de serviço guiada: o MEI emite no Emissor Nacional (gov.br) e
// o app só prepara os dados para copiar e guarda o número (migração 0020).
import { formatQuantity } from '@/features/orders/logic';

export const EMISSOR_NACIONAL_URL = 'https://www.nfse.gov.br/EmissorNacional';

export interface InvoiceItem {
  description: string;
  quantity: string | number;
}

/** Descrição do serviço para colar no Emissor: "Corte; 2 × Escova". */
export function invoiceDescription(items: InvoiceItem[], orderNumber: number) {
  const parts = items.map((i) => (Number(i.quantity) === 1 ? i.description : `${formatQuantity(i.quantity)} × ${i.description}`));
  return `${parts.join('; ') || 'Serviço prestado'} (pedido nº ${orderNumber})`;
}

/** Valor como o Emissor pede: "1234,50", sem R$ nem ponto de milhar. */
export function invoiceAmount(cents: number) {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

/** Número digitado pelo usuário: tira espaços e põe em maiúsculas. */
export function normalizeInvoiceNumber(text: string) {
  return text.trim().toUpperCase();
}

export function isValidInvoiceNumber(text: string) {
  return /^[0-9A-Z./-]{1,30}$/.test(normalizeInvoiceNumber(text));
}

// ---------------------------------------------------------------------------
// Nota fiscal automática (migração 0031)
// ---------------------------------------------------------------------------

/** Consulta pública da NFS-e pela chave de acesso, no site do governo. */
export const NFSE_CONSULTA_URL = 'https://www.nfse.gov.br/ConsultaPublica';

/**
 * Códigos de tributação nacional mais comuns entre MEIs de serviço. O certo é
 * o mesmo que aparece nas notas já emitidas no Emissor ("Código de
 * Tributação Nacional"); quem não achar aqui digita o código.
 */
export const COMMON_SERVICE_CODES: { code: string; label: string }[] = [
  { code: '060101', label: 'Cabeleireiro, barbeiro, manicure e pedicure' },
  { code: '060201', label: 'Estética, depilação e cuidados com a pele' },
  { code: '060301', label: 'Massagem, sauna e banho' },
  { code: '060401', label: 'Ginástica, dança, esportes e lutas' },
  { code: '080201', label: 'Aulas, cursos e treinamentos' },
  { code: '010101', label: 'Desenvolvimento de sistemas e sites' },
  { code: '010701', label: 'Suporte técnico em informática' },
  { code: '140101', label: 'Conserto e manutenção de máquinas, veículos e aparelhos' },
  { code: '140601', label: 'Instalação e montagem de aparelhos e equipamentos' },
  { code: '141001', label: 'Lavanderia e tinturaria' },
  { code: '130301', label: 'Fotografia e filmagem' },
  { code: '170101', label: 'Assessoria e consultoria' },
  { code: '170601', label: 'Propaganda e publicidade' },
  { code: '230101', label: 'Design gráfico e programação visual' },
  { code: '050801', label: 'Banho, tosa e cuidados com animais' },
];

/** "060101" → "06.01.01". */
export function formatServiceCode(code: string) {
  const d = code.replace(/\D/g, '');
  return d.length === 6 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : code;
}

export function serviceCodeDigits(text: string) {
  return text.replace(/\D/g, '');
}

export function serviceCodeLabel(code: string) {
  return COMMON_SERVICE_CODES.find((c) => c.code === code)?.label ?? null;
}

/** Certificado vence em até 30 dias? */
export function certificateExpiresSoon(expiresAt: string | null, now = new Date()) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000;
}
