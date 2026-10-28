// Edge Function da nota fiscal automática (NFS-e nacional), chamada pelo app
// em Configurações → Nota fiscal automática e no cartão "Nota fiscal" do
// atendimento.
//
// A API do Emissor Nacional não usa login e senha: cada chamada vai com o
// certificado digital A1 do CNPJ (conexão mTLS) e a DPS assinada com ele.
//
// * connect: abre o .pfx com a senha (que não fica guardada), confere o CNPJ e
//   a validade, e guarda o certificado e a chave cifrados (AES-GCM).
// * test: manda uma nota de R$ 1,00 para o ambiente de testes do governo,
//   que não vale como nota, para conferir se está tudo certo.
// * emit / cancel / pdf: emitem, cancelam e baixam o PDF (DANFSe) das notas.
//
// As regras (quem pode, nota já emitida, numeração) ficam nos RPCs da
// migração 0031, que só a service role executa.
import { createClient } from '@supabase/supabase-js';
// @deno-types="npm:@types/node-forge@1.3.11"
import forge from 'node-forge';

import {
  brasiliaDate,
  buildCancelContent,
  buildDpsContent,
  cnpjFromCertificateName,
  DANFSE_ENDPOINTS,
  NFSE_ENDPOINTS,
  type NfseApiError,
  nfseErrors,
  type NfseEnvironment,
  nfseNumberFromXml,
  nfseServiceDescription,
  signedDocument,
  type SigningTools,
} from '../_shared/nfse.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Chave própria para cifrar os certificados (opcional). Sem ela, a chave sai
// da service role key; trocar uma ou outra exige enviar o certificado de novo.
const sealKeyText = Deno.env.get('NFSE_CERT_KEY') ?? '';
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MESSAGES = {
  unauthorized: { status: 401, message: 'Entre de novo no app e tente outra vez.' },
  invalid_request: { status: 400, message: 'Não foi possível entender o pedido.' },
  forbidden: { status: 403, message: 'Só o dono ou um administrador pode mudar a nota fiscal automática.' },
  not_found: { status: 404, message: 'Não encontramos este atendimento ou esta nota.' },
  wrong_password: { status: 400, message: 'A senha do certificado não confere. Confira e tente de novo.' },
  bad_certificate: { status: 400, message: 'Não conseguimos abrir este arquivo. Envie o certificado A1 (.pfx ou .p12).' },
  not_company_certificate: { status: 400, message: 'Este certificado não é de CNPJ (e-CNPJ). Use o certificado A1 da empresa.' },
  certificate_expired: { status: 400, message: 'O certificado está vencido. Renove com a certificadora e envie o novo.' },
  not_connected: { status: 409, message: 'Conecte o certificado em Configurações → Nota fiscal automática.' },
  invoice_exists: { status: 409, message: 'Este atendimento já tem nota.' },
  emission_in_progress: { status: 409, message: 'A nota já está sendo emitida. Espere um minutinho.' },
  order_closed: { status: 409, message: 'Atendimento cancelado não recebe nota.' },
  invalid_amount: { status: 400, message: 'O atendimento precisa ter valor para emitir a nota.' },
  not_from_emissor: { status: 409, message: 'Esta nota foi feita no site do Emissor. Cancele por lá.' },
  cancel_reason_too_short: { status: 400, message: 'Escreva o motivo com pelo menos 15 letras.' },
  rejected: { status: 422, message: 'O Emissor Nacional recusou a nota.' },
  gov_unavailable: { status: 503, message: 'O Emissor Nacional não respondeu. Tente de novo em alguns minutos.' },
  internal: { status: 500, message: 'Não foi possível concluir agora. Tente de novo em alguns minutos.' },
} as const;
type ErrorCode = keyof typeof MESSAGES;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function fail(code: ErrorCode, details?: NfseApiError[]) {
  const { status, message } = MESSAGES[code];
  return json({ error: code, message, details: details ?? [] }, status);
}

class Failure extends Error {
  constructor(
    public code: ErrorCode,
    public details?: NfseApiError[],
  ) {
    super(code);
  }
}

/** Erro de um RPC → código conhecido (a mensagem do banco é o código). */
function rpcFailure(error: { message?: string }): Failure {
  const code = (error.message ?? '') as ErrorCode;
  return new Failure(code in MESSAGES ? code : 'internal');
}

// ---------------------------------------------------------------------------
// Base64, gzip e o cofre do certificado
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gzipBase64(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function gunzipBase64(b64: string) {
  const stream = new Blob([fromBase64(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

async function sealKey(version: string) {
  const material = version === 'k1' ? fromBase64(sealKeyText) : new TextEncoder().encode(serviceKey);
  const base = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('gestao-facil-nfse'), info: new TextEncoder().encode('certificado-a1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

interface Certificate {
  /** Certificado e cadeia em PEM (para a conexão mTLS). */
  certPem: string;
  /** Chave privada em PEM. */
  keyPem: string;
  /** Certificado (DER) em base64, para a assinatura. */
  certB64: string;
}

async function seal(cert: Certificate) {
  const version = sealKeyText ? 'k1' : 's1';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(cert));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(version), data));
  return `${version}:${toBase64(iv)}:${toBase64(cipher)}`;
}

async function unseal(sealed: string): Promise<Certificate> {
  const [version, iv, cipher] = sealed.split(':');
  if (!version || !iv || !cipher) throw new Failure('not_connected');
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await sealKey(version), fromBase64(cipher));
    return JSON.parse(new TextDecoder().decode(plain)) as Certificate;
  } catch {
    // A chave mudou (segredo trocado): é preciso enviar o certificado de novo.
    throw new Failure('not_connected');
  }
}

// ---------------------------------------------------------------------------
// Certificado A1
// ---------------------------------------------------------------------------

/** CNPJ no "outro nome" 2.16.76.1.3.3 do certificado ICP-Brasil, quando o nome não traz. */
function cnpjFromIcpExtension(der: string) {
  const oid = '\x06\x05\x60\x4c\x01\x03\x03';
  const at = der.indexOf(oid);
  if (at < 0) return null;
  return /([0-9]{14})/.exec(der.slice(at + oid.length, at + oid.length + 40))?.[1] ?? null;
}

function openPfx(pfxB64: string, password: string) {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(pfxB64)), false, password);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    throw new Failure(/password|MAC/i.test(message) ? 'wrong_password' : 'bad_certificate');
  }
  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  const key = keyBags.map((b) => b.key).find((k): k is forge.pki.rsa.PrivateKey => !!k && 'n' in k);
  if (!key) throw new Failure('bad_certificate');
  const leaf = certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n?.equals(key.n));
  if (!leaf) throw new Failure('bad_certificate');

  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(leaf)).getBytes();
  const commonName = String(leaf.subject.getField('CN')?.value ?? '');
  const cnpj = cnpjFromCertificateName(commonName) ?? cnpjFromIcpExtension(der);
  if (!cnpj) throw new Failure('not_company_certificate');
  if (leaf.validity.notAfter.getTime() <= Date.now()) throw new Failure('certificate_expired');

  const chain = [leaf, ...certs.filter((c) => c !== leaf)];
  const cert: Certificate = {
    certPem: chain.map((c) => forge.pki.certificateToPem(c)).join(''),
    keyPem: forge.pki.privateKeyToPem(key),
    certB64: forge.util.encode64(der),
  };
  return { cert, cnpj, holder: commonName.replace(/:[0-9]{14}\s*$/, '').trim() || cnpj, expiresAt: leaf.validity.notAfter };
}

function signingTools(cert: Certificate): SigningTools {
  const key = forge.pki.privateKeyFromPem(cert.keyPem);
  return {
    sha256Base64: (text) => forge.util.encode64(forge.md.sha256.create().update(text, 'utf8').digest().getBytes()),
    signBase64: (text) => {
      const md = forge.md.sha256.create();
      md.update(text, 'utf8');
      return forge.util.encode64(key.sign(md));
    },
    certificateBase64: cert.certB64,
  };
}

// ---------------------------------------------------------------------------
// Chamadas ao governo (com o certificado)
// ---------------------------------------------------------------------------

async function govFetch(cert: Certificate, target: string, init: { method: 'GET' | 'POST'; body?: unknown }) {
  const client = Deno.createHttpClient({ cert: cert.certPem, key: cert.keyPem });
  try {
    return await fetch(target, {
      method: init.method,
      headers: init.body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: '*/*' },
      body: init.body ? JSON.stringify(init.body) : undefined,
      client,
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    console.error('nota-fiscal: governo não respondeu', e instanceof Error ? e.message : e);
    throw new Failure('gov_unavailable');
  } finally {
    client.close();
  }
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    console.error('nota-fiscal: resposta sem JSON', res.status, text.slice(0, 300));
    return null;
  }
}

interface Emission {
  accessKey: string;
  number: string;
}

async function sendDps(cert: Certificate, environment: NfseEnvironment, dps: { id: string; content: string }): Promise<Emission> {
  const xml = signedDocument('DPS', 'infDPS', dps.id, dps.content, signingTools(cert));
  const res = await govFetch(cert, NFSE_ENDPOINTS[environment], { method: 'POST', body: { dpsXmlGZipB64: await gzipBase64(xml) } });
  const body = await readJson(res);
  const accessKey = typeof body?.chaveAcesso === 'string' ? body.chaveAcesso : '';
  if (res.ok && /^[0-9]{50}$/.test(accessKey) && typeof body?.nfseXmlGZipB64 === 'string') {
    const nfseXml = await gunzipBase64(body.nfseXmlGZipB64).catch(() => '');
    return { accessKey, number: nfseNumberFromXml(nfseXml) ?? accessKey.slice(-15).replace(/^0+/, '') };
  }
  if (res.status >= 500 || !body) throw new Failure('gov_unavailable');
  throw new Failure('rejected', nfseErrors(body));
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

type Body = Record<string, unknown>;

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.length <= max ? v.trim() : null);
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

function settingsInput(body: Body) {
  const cityIbge = str(body.city_ibge, 7);
  const cityName = str(body.city_name, 80);
  const serviceCode = str(body.service_code, 6);
  if (!cityIbge || !/^[0-9]{7}$/.test(cityIbge) || !cityName || cityName.length < 2 || !serviceCode || !/^[0-9]{6}$/.test(serviceCode)) {
    throw new Failure('invalid_request');
  }
  return { cityIbge, cityName, serviceCode };
}

async function connect(userId: string, body: Body) {
  const org = uuid(body.organization_id);
  const pfx = str(body.pfx_base64, 40_000);
  const password = typeof body.password === 'string' && body.password.length <= 200 ? body.password : null;
  if (!org || !pfx || password === null) throw new Failure('invalid_request');
  const settings = settingsInput(body);
  const opened = openPfx(pfx, password);
  const { error } = await admin.rpc('nfse_save_connection', {
    p_user: userId,
    p_org: org,
    p_cnpj: opened.cnpj,
    p_city_ibge: settings.cityIbge,
    p_city_name: settings.cityName,
    p_service_code: settings.serviceCode,
    p_holder: opened.holder,
    p_expires_at: opened.expiresAt.toISOString(),
    p_sealed: await seal(opened.cert),
  });
  if (error) throw rpcFailure(error);
  return { ok: true, cnpj: opened.cnpj, holder: opened.holder, expires_at: opened.expiresAt.toISOString() };
}

async function updateSettings(userId: string, body: Body) {
  const org = uuid(body.organization_id);
  if (!org) throw new Failure('invalid_request');
  const s = settingsInput(body);
  const { error } = await admin.rpc('nfse_update_settings', {
    p_user: userId,
    p_org: org,
    p_city_ibge: s.cityIbge,
    p_city_name: s.cityName,
    p_service_code: s.serviceCode,
  });
  if (error) throw rpcFailure(error);
  return { ok: true };
}

async function disconnect(userId: string, body: Body) {
  const org = uuid(body.organization_id);
  if (!org) throw new Failure('invalid_request');
  const { error } = await admin.rpc('nfse_disconnect', { p_user: userId, p_org: org });
  if (error) throw rpcFailure(error);
  return { ok: true };
}

/** Nota de R$ 1,00 no ambiente de testes do governo (não vale como nota). */
async function testConnection(userId: string, body: Body) {
  const org = uuid(body.organization_id);
  if (!org) throw new Failure('invalid_request');
  const { data: member } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', org)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member) throw new Failure('not_found');
  const { data: settings } = await admin.from('nfse_settings').select('cnpj, city_ibge, service_code, connected').eq('organization_id', org).maybeSingle();
  const { data: vault } = await admin.from('nfse_certificates').select('sealed').eq('organization_id', org).maybeSingle();
  if (!settings?.connected || !vault?.sealed) throw new Failure('not_connected');
  const cert = await unseal(vault.sealed);
  const now = new Date();
  const dps = buildDpsContent({
    environment: 'test',
    issuedAt: new Date(now.getTime() - 60_000),
    cnpj: settings.cnpj,
    cityIbge: settings.city_ibge,
    serviceCode: settings.service_code,
    // Número alto e variável: o ambiente de testes não guarda a numeração do app.
    dpsNumber: Math.floor(now.getTime() / 1000),
    description: 'Nota de teste do Gestão Fácil (sem valor fiscal)',
    amountCents: 100,
    customer: null,
  });
  const result = await sendDps(cert, 'test', dps);
  return { ok: true, number: result.number, access_key: result.accessKey };
}

async function emit(userId: string, body: Body) {
  const orderId = uuid(body.order_id);
  if (!orderId) throw new Failure('invalid_request');
  const { data: prep, error } = await admin.rpc('nfse_prepare_emission', { p_user: userId, p_order_id: orderId });
  if (error) throw rpcFailure(error);
  const p = prep as {
    order_number: number;
    amount_cents: number;
    customer_name: string | null;
    customer_document: string | null;
    items: { description: string; quantity: string | number }[];
    cnpj: string;
    city_ibge: string;
    service_code: string;
    dps_number: number;
    sealed: string;
  };

  const release = () => admin.rpc('nfse_release_emission', { p_user: userId, p_order_id: orderId });
  let result: Emission;
  try {
    const cert = await unseal(p.sealed);
    const dps = buildDpsContent({
      environment: 'production',
      // Um minuto antes: o governo recusa DPS com horário "no futuro".
      issuedAt: new Date(Date.now() - 60_000),
      cnpj: p.cnpj,
      cityIbge: p.city_ibge,
      serviceCode: p.service_code,
      dpsNumber: Number(p.dps_number),
      description: nfseServiceDescription(p.items, p.order_number),
      amountCents: Number(p.amount_cents),
      customer: p.customer_name ? { name: p.customer_name, document: p.customer_document } : null,
    });
    result = await sendDps(cert, 'production', dps);
  } catch (e) {
    // Recusa clara: solta a trava para tentar de novo. Se o governo não
    // respondeu, a trava fica 2 minutos (a nota pode ter saído).
    if (!(e instanceof Failure && e.code === 'gov_unavailable')) await release();
    throw e;
  }

  const { data: invoice, error: recordError } = await admin.rpc('nfse_record_emission', {
    p_user: userId,
    p_order_id: orderId,
    p_number: result.number,
    p_access_key: result.accessKey,
    p_issued_on: brasiliaDate(new Date()),
  });
  if (recordError) {
    console.error('nota-fiscal: nota emitida mas não registrada', result.accessKey, recordError.message);
    throw new Failure('internal');
  }
  return { ok: true, invoice, number: result.number, access_key: result.accessKey };
}

async function cancel(userId: string, body: Body) {
  const invoiceId = uuid(body.invoice_id);
  const reason = str(body.reason, 255);
  const reasonCode = body.reason_code === 1 || body.reason_code === 2 || body.reason_code === 9 ? body.reason_code : null;
  if (!invoiceId || !reason || !reasonCode) throw new Failure('invalid_request');
  if (reason.length < 15) throw new Failure('cancel_reason_too_short');
  const { data: ctx, error } = await admin.rpc('nfse_invoice_context', { p_user: userId, p_invoice_id: invoiceId });
  if (error) throw rpcFailure(error);
  const c = ctx as { access_key: string; cancelled: boolean; cnpj: string; sealed: string };

  if (!c.cancelled) {
    const cert = await unseal(c.sealed);
    const event = buildCancelContent({
      environment: 'production',
      issuedAt: new Date(Date.now() - 60_000),
      cnpj: c.cnpj,
      accessKey: c.access_key,
      reasonCode,
      reason,
    });
    const xml = signedDocument('pedRegEvento', 'infPedReg', event.id, event.content, signingTools(cert));
    const res = await govFetch(cert, `${NFSE_ENDPOINTS.production}/${c.access_key}/eventos`, {
      method: 'POST',
      body: { pedidoRegistroEventoXmlGZipB64: await gzipBase64(xml) },
    });
    const resBody = await readJson(res);
    if (!res.ok || typeof resBody?.eventoXmlGZipB64 !== 'string') {
      if (res.status >= 500 || !resBody) throw new Failure('gov_unavailable');
      throw new Failure('rejected', nfseErrors(resBody));
    }
  }

  const { error: recordError } = await admin.rpc('nfse_record_cancel', { p_user: userId, p_invoice_id: invoiceId, p_reason: reason });
  if (recordError) throw rpcFailure(recordError);
  return { ok: true };
}

/** PDF da nota (DANFSe) em base64. */
async function pdf(userId: string, body: Body) {
  const invoiceId = uuid(body.invoice_id);
  if (!invoiceId) throw new Failure('invalid_request');
  const { data: ctx, error } = await admin.rpc('nfse_invoice_context', { p_user: userId, p_invoice_id: invoiceId });
  if (error) throw rpcFailure(error);
  const c = ctx as { access_key: string; sealed: string };
  const cert = await unseal(c.sealed);
  const res = await govFetch(cert, `${DANFSE_ENDPOINTS.production}/${c.access_key}`, { method: 'GET' });
  if (!res.ok) {
    console.error('nota-fiscal: PDF não veio', res.status);
    throw new Failure('gov_unavailable');
  }
  return { ok: true, pdf_base64: toBase64(new Uint8Array(await res.arrayBuffer())), access_key: c.access_key };
}

const ACTIONS: Record<string, (userId: string, body: Body) => Promise<unknown>> = {
  connect,
  update_settings: updateSettings,
  disconnect,
  test: testConnection,
  emit,
  cancel,
  pdf,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('invalid_request');

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return fail('unauthorized');
  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !auth?.user) return fail('unauthorized');

  let body: Body;
  try {
    const text = await req.text();
    if (text.length > 60_000) return fail('invalid_request');
    body = JSON.parse(text) as Body;
  } catch {
    return fail('invalid_request');
  }
  const action = typeof body?.action === 'string' ? ACTIONS[body.action] : undefined;
  if (!action) return fail('invalid_request');

  try {
    return json(await action(auth.user.id, body));
  } catch (e) {
    if (e instanceof Failure) return fail(e.code, e.details);
    console.error('nota-fiscal: erro inesperado', e instanceof Error ? e.message : e);
    return fail('internal');
  }
});
