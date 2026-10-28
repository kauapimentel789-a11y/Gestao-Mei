/// <reference types="node" />
import { createHash, createVerify, generateKeyPairSync, sign } from 'node:crypto';

import { certificateExpiresSoon, formatServiceCode, serviceCodeDigits } from '@/features/invoices/logic';

import {
  brasiliaDateTime,
  buildCancelContent,
  buildDpsContent,
  cnpjFromCertificateName,
  dpsId,
  nfseDecimal,
  nfseErrors,
  nfseNumberFromXml,
  nfseServiceDescription,
  signedDocument,
  xmlText,
} from '../../supabase/functions/_shared/nfse';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const tools = {
  sha256Base64: (t: string) => createHash('sha256').update(t, 'utf8').digest('base64'),
  signBase64: (t: string) => sign('sha256', Buffer.from(t, 'utf8'), privateKey).toString('base64'),
  certificateBase64: 'Q0VSVA==',
};

const base = {
  environment: 'production' as const,
  issuedAt: new Date('2026-10-28T15:04:05Z'),
  cnpj: '12345678000199',
  cityIbge: '3550308',
  serviceCode: '060101',
  dpsNumber: 42,
  description: 'Corte',
  amountCents: 5000,
};

describe('DPS da NFS-e nacional', () => {
  it('monta o Id com município, CNPJ, série e número', () => {
    const id = dpsId('3550308', '12345678000199', '900', 42);
    expect(id).toBe('DPS355030821234567800019900900000000000000042');
    expect(id).toMatch(/^DPS[0-9]{42}$/);
  });

  it('hora de Brasília e valor no formato do leiaute', () => {
    expect(brasiliaDateTime(new Date('2026-10-28T15:04:05.900Z'))).toBe('2026-10-28T12:04:05-03:00');
    expect(brasiliaDateTime(new Date('2026-10-29T01:00:00Z'))).toBe('2026-10-28T22:00:00-03:00');
    expect(nfseDecimal(5000)).toBe('50.00');
    expect(nfseDecimal(123405)).toBe('1234.05');
    expect(() => nfseDecimal(-1)).toThrow();
  });

  it('prestador MEI, tomador com CPF e campos na ordem do leiaute', () => {
    const { content } = buildDpsContent({ ...base, customer: { name: 'Caio & Cia', document: '123.456.789-01' } });
    expect(content).toContain('<tpAmb>1</tpAmb><dhEmi>2026-10-28T12:04:05-03:00</dhEmi>');
    expect(content).toContain('<serie>900</serie><nDPS>42</nDPS><dCompet>2026-10-28</dCompet><tpEmit>1</tpEmit><cLocEmi>3550308</cLocEmi>');
    expect(content).toContain('<prest><CNPJ>12345678000199</CNPJ><regTrib><opSimpNac>2</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>');
    expect(content).toContain('<toma><CPF>12345678901</CPF><xNome>Caio &amp; Cia</xNome></toma>');
    expect(content).toContain('<cServ><cTribNac>060101</cTribNac><xDescServ>Corte</xDescServ></cServ>');
    expect(content).toContain('<vServ>50.00</vServ>');
    expect(content).toContain('<totTrib><indTotTrib>0</indTotTrib></totTrib>');
    expect(content).not.toMatch(/<[a-zA-Z]+\/>/);
  });

  it('cliente sem documento: nota sem tomador; ambiente de testes', () => {
    const { content } = buildDpsContent({ ...base, environment: 'test', customer: { name: 'Caio', document: null } });
    expect(content).not.toContain('<toma>');
    expect(content).toContain('<tpAmb>2</tpAmb>');
  });

  it('recusa dados fora do formato', () => {
    expect(() => buildDpsContent({ ...base, cnpj: '123' })).toThrow('invalid_cnpj');
    expect(() => buildDpsContent({ ...base, serviceCode: '6.01' })).toThrow('invalid_service_code');
    expect(() => buildDpsContent({ ...base, description: '  ' })).toThrow('invalid_description');
  });

  it('escapa texto e tira caracteres de controle', () => {
    expect(xmlText(' a <b>\n c\u0001 ')).toBe('a &lt;b&gt; c');
  });

  it('descrição do serviço com quantidades', () => {
    expect(nfseServiceDescription([{ description: 'Corte', quantity: '1.000' }, { description: 'Escova', quantity: '2' }], 7)).toBe(
      'Corte; 2 × Escova (pedido nº 7)',
    );
  });

  it('assina o elemento canônico e envelopa a assinatura', () => {
    const { id, content } = buildDpsContent(base);
    const xml = signedDocument('DPS', 'infDPS', id, content, tools);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">')).toBe(true);

    const canonical = `<infDPS xmlns="http://www.sped.fazenda.gov.br/nfse" Id="${id}">${content}</infDPS>`;
    expect(xml).toContain(`<infDPS Id="${id}">${content}</infDPS>`);
    expect(xml).toContain(`<DigestValue>${tools.sha256Base64(canonical)}</DigestValue>`);
    expect(xml).toContain(`<Reference URI="#${id}">`);

    const signedInfo = /<SignedInfo>.*<\/SignedInfo>/.exec(xml)![0].replace('<SignedInfo>', '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">');
    const signature = /<SignatureValue>(.*)<\/SignatureValue>/.exec(xml)![1];
    expect(createVerify('sha256').update(signedInfo, 'utf8').verify(publicKey, signature, 'base64')).toBe(true);
  });

  it('pedido de cancelamento', () => {
    const key = '3'.repeat(50);
    const ev = buildCancelContent({ environment: 'production', issuedAt: base.issuedAt, cnpj: base.cnpj, accessKey: key, reasonCode: 1, reason: 'Valor digitado errado' });
    expect(ev.id).toBe(`PRE${key}101101`);
    expect(ev.content).toContain(`<CNPJAutor>12345678000199</CNPJAutor><chNFSe>${key}</chNFSe>`);
    expect(ev.content).toContain('<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>Valor digitado errado</xMotivo></e101101>');
    expect(() => buildCancelContent({ environment: 'production', issuedAt: base.issuedAt, cnpj: base.cnpj, accessKey: key, reasonCode: 9, reason: 'curto' })).toThrow(
      'cancel_reason_too_short',
    );
  });
});

describe('resposta do governo e certificado', () => {
  it('lê o número da nota e os erros', () => {
    expect(nfseNumberFromXml('<NFSe><infNFSe><nNFSe>123</nNFSe></infNFSe></NFSe>')).toBe('123');
    expect(nfseNumberFromXml('<x/>')).toBeNull();
    expect(nfseErrors({ erros: [{ Codigo: 'E0008', Descricao: 'Data inválida', Complemento: 'dhEmi' }] })).toEqual([
      { code: 'E0008', message: 'Data inválida dhEmi' },
    ]);
    expect(nfseErrors({ erro: { codigo: 'E1', descricao: 'x' } })).toEqual([{ code: 'E1', message: 'x' }]);
    expect(nfseErrors(null)).toEqual([]);
  });

  it('CNPJ do nome do e-CNPJ', () => {
    expect(cnpjFromCertificateName('STUDIO BIA LTDA:12345678000199')).toBe('12345678000199');
    expect(cnpjFromCertificateName('MARIA DA SILVA:12345678901')).toBeNull();
  });
});

describe('telas da nota automática', () => {
  it('código do serviço', () => {
    expect(formatServiceCode('060101')).toBe('06.01.01');
    expect(serviceCodeDigits('06.01.01')).toBe('060101');
  });

  it('aviso de certificado vencendo', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    expect(certificateExpiresSoon('2026-11-10T00:00:00Z', now)).toBe(true);
    expect(certificateExpiresSoon('2027-10-28T00:00:00Z', now)).toBe(false);
    expect(certificateExpiresSoon(null, now)).toBe(false);
  });
});
