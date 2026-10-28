// Nota fiscal automática (migração 0031 + Edge Function `nota-fiscal`): o app
// conecta o certificado A1 do CNPJ uma vez e, daí em diante, emite e cancela
// a NFS-e direto no Emissor Nacional.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { invoiceKeys } from './api';

export interface NfseSettings {
  cnpj: string;
  city_ibge: string;
  city_name: string;
  service_code: string;
  connected: boolean;
  certificate_holder: string | null;
  certificate_expires_at: string | null;
}

/** Erro com a mensagem pronta para a tela (vem da Edge Function). */
export class NfseError extends Error {
  constructor(
    message: string,
    readonly code: string,
    /** Motivos da recusa, como o Emissor Nacional escreveu. */
    readonly details: { code: string; message: string }[] = [],
  ) {
    super(message);
  }
}

export const nfseKeys = {
  settings: (orgId: string) => ['nfse-settings', orgId] as const,
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('nota-fiscal', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new NfseError(
        payload?.message ?? 'Não foi possível concluir agora. Tente de novo em alguns minutos.',
        payload?.error ?? 'unknown',
        Array.isArray(payload?.details) ? payload.details : [],
      );
    }
    throw new NfseError('Sem conexão. Confira a internet e tente de novo.', 'network');
  }
  return data as T;
}

/** Mensagem da recusa, com os motivos do governo quando houver. */
export function nfseErrorText(error: unknown) {
  if (error instanceof NfseError) {
    const reasons = error.details.map((d) => (d.code ? `${d.code}: ${d.message}` : d.message));
    return [error.message, ...reasons].join('\n');
  }
  return 'Não foi possível concluir agora. Tente de novo em alguns minutos.';
}

/** Configuração da empresa (null quando nunca conectou). */
export function useNfseSettings(orgId: string) {
  return useQuery({
    queryKey: nfseKeys.settings(orgId),
    queryFn: async (): Promise<NfseSettings | null> => {
      const { data, error } = await supabase
        .from('nfse_settings')
        .select('cnpj, city_ibge, city_name, service_code, connected, certificate_holder, certificate_expires_at')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return (data as NfseSettings | null) ?? null;
    },
    retry: false,
  });
}

export interface NfseSettingsInput {
  cityIbge: string;
  cityName: string;
  serviceCode: string;
}

const settingsBody = (s: NfseSettingsInput) => ({ city_ibge: s.cityIbge, city_name: s.cityName, service_code: s.serviceCode });

export function useConnectNfse(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NfseSettingsInput & { pfxBase64: string; password: string }) =>
      call<{ cnpj: string; holder: string; expires_at: string }>({
        action: 'connect',
        organization_id: orgId,
        pfx_base64: input.pfxBase64,
        password: input.password,
        ...settingsBody(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: nfseKeys.settings(orgId) }),
  });
}

export function useUpdateNfseSettings(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NfseSettingsInput) => call({ action: 'update_settings', organization_id: orgId, ...settingsBody(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: nfseKeys.settings(orgId) }),
  });
}

export function useDisconnectNfse(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call({ action: 'disconnect', organization_id: orgId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: nfseKeys.settings(orgId) }),
  });
}

export function useTestNfse(orgId: string) {
  return useMutation({
    mutationFn: () => call<{ number: string }>({ action: 'test', organization_id: orgId }),
  });
}

export function useEmitNfse(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => call<{ number: string; access_key: string }>({ action: 'emit', order_id: orderId }),
    onSettled: () => qc.invalidateQueries({ queryKey: invoiceKeys.all(orgId) }),
  });
}

export function useCancelNfse(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { invoiceId: string; reasonCode: 1 | 2 | 9; reason: string }) =>
      call({ action: 'cancel', invoice_id: input.invoiceId, reason_code: input.reasonCode, reason: input.reason }),
    onSettled: () => qc.invalidateQueries({ queryKey: invoiceKeys.all(orgId) }),
  });
}

export function useNfsePdf() {
  return useMutation({
    mutationFn: (invoiceId: string) => call<{ pdf_base64: string; access_key: string }>({ action: 'pdf', invoice_id: invoiceId }),
  });
}

/** Cidade e código IBGE pelo CEP (ViaCEP). */
export async function cityFromCep(cep: string): Promise<{ name: string; ibge: string } | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) return null;
  const data = (await res.json()) as { localidade?: string; uf?: string; ibge?: string; erro?: unknown };
  if (data.erro || !data.ibge || !/^[0-9]{7}$/.test(data.ibge) || !data.localidade) return null;
  return { name: `${data.localidade}${data.uf ? ` - ${data.uf}` : ''}`, ibge: data.ibge };
}

/** Lê o arquivo escolhido (web ou celular) como base64, sem o prefixo "data:". */
export async function fileToBase64(uri: string, file?: Blob): Promise<string> {
  const blob = file ?? (await (await fetch(uri)).blob());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.readAsDataURL(blob);
  });
}
