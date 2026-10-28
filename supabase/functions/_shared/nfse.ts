// NFS-e nacional: monta a DPS e o pedido de cancelamento em XML, já no formato
// canônico (C14N) usado na assinatura, e lê a resposta do governo.
//
// Sem dependências: roda na Edge Function `nota-fiscal` (Deno) e nos testes do
// app (Jest). A criptografia (SHA-256 e RSA) chega pelos parâmetros.
//
// O XML sai sem espaços entre as tags, sem tags vazias e sem comentários, e o
// elemento assinado (infDPS / infPedReg) é o primeiro filho da raiz, com o
// namespace herdado. Assim o texto que vai para o hash é exatamente a forma
// canônica do elemento, sem precisar de uma biblioteca de C14N.

export const NFSE_NS = 'http://www.sped.fazenda.gov.br/nfse';
const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

export const NFSE_LAYOUT_VERSION = '1.01';
export const NFSE_APP_VERSION = 'GestaoFacil_1.0';
/** Série própria do app, para não cruzar com a numeração do site do Emissor. */
export const NFSE_DPS_SERIES = '900';

export const NFSE_ENDPOINTS = {
  production: 'https://sefin.nfse.gov.br/SefinNacional/nfse',
  test: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse',
} as const;

export const DANFSE_ENDPOINTS = {
  production: 'https://adn.nfse.gov.br/danfse',
  test: 'https://adn.producaorestrita.nfse.gov.br/danfse',
} as const;

export type NfseEnvironment = keyof typeof NFSE_ENDPOINTS;

export interface SigningTools {
  /** SHA-256 do texto (UTF-8), em base64. */
  sha256Base64(text: string): string;
  /** Assinatura RSA-SHA256 do texto (UTF-8), em base64. */
  signBase64(text: string): string;
  /** Certificado (DER) em base64. */
  certificateBase64: string;
}

/** Escapa texto como a forma canônica do XML (e tira caracteres de controle). */
export function xmlText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function el(name: string, content: string) {
  return `<${name}>${content}</${name}>`;
}

/** Centavos no formato decimal do leiaute: 12345 → "123.45". */
export function nfseDecimal(cents: number) {
  if (!Number.isInteger(cents) || cents < 0) throw new Error('invalid_amount');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** Data e hora de Brasília (UTC−3, sem horário de verão) no formato do leiaute. */
export function brasiliaDateTime(date: Date) {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}-03:00`;
}

export function brasiliaDate(date: Date) {
  return brasiliaDateTime(date).slice(0, 10);
}

/** Descrição do serviço: "Corte; 2 × Escova (pedido nº 12)". */
export function nfseServiceDescription(items: { description: string; quantity: string | number }[], orderNumber: number) {
  const parts = items.map((i) => {
    const q = Number(i.quantity);
    if (q === 1) return i.description;
    const shown = Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
    return `${shown} × ${i.description}`;
  });
  return `${parts.join('; ') || 'Serviço prestado'} (pedido nº ${orderNumber})`.slice(0, 2000);
}

export interface DpsInput {
  environment: NfseEnvironment;
  issuedAt: Date;
  cnpj: string;
  cityIbge: string;
  serviceCode: string;
  dpsNumber: number;
  description: string;
  amountCents: number;
  customer?: { name: string; document?: string | null } | null;
}

/** Id da DPS: "DPS" + município (7) + tipo de inscrição (1) + CNPJ (14) + série (5) + número (15). */
export function dpsId(cityIbge: string, cnpj: string, series: string, number: number) {
  return `DPS${cityIbge}2${cnpj}${series.padStart(5, '0')}${String(number).padStart(15, '0')}`;
}

function assertDigits(value: string, size: number, code: string) {
  if (!new RegExp(`^[0-9]{${size}}$`).test(value)) throw new Error(code);
}

/** Conteúdo de infDPS (sem a tag) e o Id. Prestador MEI (opSimpNac 2), ISS normal, não retido. */
export function buildDpsContent(input: DpsInput) {
  assertDigits(input.cnpj, 14, 'invalid_cnpj');
  assertDigits(input.cityIbge, 7, 'invalid_city');
  assertDigits(input.serviceCode, 6, 'invalid_service_code');
  if (!Number.isInteger(input.dpsNumber) || input.dpsNumber < 1) throw new Error('invalid_dps_number');
  const description = xmlText(input.description);
  if (!description) throw new Error('invalid_description');

  const id = dpsId(input.cityIbge, input.cnpj, NFSE_DPS_SERIES, input.dpsNumber);
  const doc = input.customer?.document?.replace(/\D/g, '') ?? '';
  const customerName = input.customer ? xmlText(input.customer.name).slice(0, 300) : '';
  const toma =
    input.customer && customerName && (doc.length === 11 || doc.length === 14)
      ? el('toma', (doc.length === 14 ? el('CNPJ', doc) : el('CPF', doc)) + el('xNome', customerName))
      : '';

  const content =
    el('tpAmb', input.environment === 'production' ? '1' : '2') +
    el('dhEmi', brasiliaDateTime(input.issuedAt)) +
    el('verAplic', NFSE_APP_VERSION) +
    el('serie', NFSE_DPS_SERIES) +
    el('nDPS', String(input.dpsNumber)) +
    el('dCompet', brasiliaDate(input.issuedAt)) +
    el('tpEmit', '1') +
    el('cLocEmi', input.cityIbge) +
    el('prest', el('CNPJ', input.cnpj) + el('regTrib', el('opSimpNac', '2') + el('regEspTrib', '0'))) +
    toma +
    el('serv', el('locPrest', el('cLocPrestacao', input.cityIbge)) + el('cServ', el('cTribNac', input.serviceCode) + el('xDescServ', description))) +
    el(
      'valores',
      el('vServPrest', el('vServ', nfseDecimal(input.amountCents))) +
        el('trib', el('tribMun', el('tribISSQN', '1') + el('tpRetISSQN', '1')) + el('totTrib', el('indTotTrib', '0'))),
    );
  return { id, content };
}

export interface CancelInput {
  environment: NfseEnvironment;
  issuedAt: Date;
  cnpj: string;
  accessKey: string;
  /** 1 - Erro na emissão; 2 - Serviço não prestado; 9 - Outros. */
  reasonCode: 1 | 2 | 9;
  reason: string;
}

export function buildCancelContent(input: CancelInput) {
  assertDigits(input.cnpj, 14, 'invalid_cnpj');
  assertDigits(input.accessKey, 50, 'invalid_access_key');
  const reason = xmlText(input.reason).slice(0, 255);
  if (reason.length < 15) throw new Error('cancel_reason_too_short');
  const id = `PRE${input.accessKey}101101`;
  const content =
    el('tpAmb', input.environment === 'production' ? '1' : '2') +
    el('verAplic', NFSE_APP_VERSION) +
    el('dhEvento', brasiliaDateTime(input.issuedAt)) +
    el('CNPJAutor', input.cnpj) +
    el('chNFSe', input.accessKey) +
    el('e101101', el('xDesc', 'Cancelamento de NFS-e') + el('cMotivo', String(input.reasonCode)) + el('xMotivo', reason));
  return { id, content };
}

/**
 * Documento assinado (XMLDSig envelopado, RSA-SHA256, C14N), pronto para o
 * gzip + base64. `root` é "DPS"/"pedRegEvento"; `signed` é "infDPS"/"infPedReg".
 */
export function signedDocument(root: string, signed: string, id: string, content: string, tools: SigningTools) {
  const canonical = `<${signed} xmlns="${NFSE_NS}" Id="${id}">${content}</${signed}>`;
  const digest = tools.sha256Base64(canonical);
  const signedInfo =
    `<SignedInfo xmlns="${DSIG_NS}">` +
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>` +
    `<Reference URI="#${id}"><Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="${C14N}"></Transform>` +
    `</Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const signature = tools.signBase64(signedInfo);
  const inDocSignedInfo = signedInfo.replace(` xmlns="${DSIG_NS}"`, '');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<${root} xmlns="${NFSE_NS}" versao="${NFSE_LAYOUT_VERSION}">` +
    `<${signed} Id="${id}">${content}</${signed}>` +
    `<Signature xmlns="${DSIG_NS}">${inDocSignedInfo}` +
    `<SignatureValue>${signature}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${tools.certificateBase64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature></${root}>`
  );
}

/** Número da NFS-e dentro do XML devolvido pelo governo. */
export function nfseNumberFromXml(xml: string) {
  return /<nNFSe>\s*([0-9]{1,15})\s*<\/nNFSe>/.exec(xml)?.[1] ?? null;
}

export interface NfseApiError {
  code: string;
  message: string;
}

/** Erros da resposta (`erros` ou `erro`, com Codigo/Descricao em maiúscula ou não). */
export function nfseErrors(body: unknown): NfseApiError[] {
  if (!body || typeof body !== 'object') return [];
  const raw = (body as Record<string, unknown>).erros ?? (body as Record<string, unknown>).erro;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((e) => {
    const item = (e ?? {}) as Record<string, unknown>;
    const code = String(item.Codigo ?? item.codigo ?? '');
    const description = String(item.Descricao ?? item.descricao ?? '');
    const extra = String(item.Complemento ?? item.complemento ?? '');
    return { code, message: [description, extra].filter(Boolean).join(' ') || 'Recusada pelo Emissor Nacional.' };
  });
}

/** CNPJ do certificado e-CNPJ: o nome traz "RAZÃO SOCIAL:12345678000199". */
export function cnpjFromCertificateName(commonName: string) {
  return /:([0-9]{14})\s*$/.exec(commonName)?.[1] ?? null;
}
