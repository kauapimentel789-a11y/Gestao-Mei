// Configurações → Nota fiscal automática: conecta o certificado A1 do CNPJ
// para emitir a NFS-e direto do app (Edge Function `nota-fiscal`).
import * as DocumentPicker from 'expo-document-picker';
import { CheckCircle2, FileKey } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { PickerModal } from '@/components/PickerModal';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import {
  cityFromCep,
  fileToBase64,
  type NfseSettings,
  nfseErrorText,
  useConnectNfse,
  useDisconnectNfse,
  useNfseSettings,
  useTestNfse,
  useUpdateNfseSettings,
} from '@/features/invoices/emissor';
import { certificateExpiresSoon, COMMON_SERVICE_CODES, formatServiceCode, serviceCodeDigits, serviceCodeLabel } from '@/features/invoices/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { formatDocument } from '@/lib/document';
import { friendlyError } from '@/lib/errors';
import { colors, fonts, radius } from '@/theme/tokens';

const TITLE = 'Nota fiscal automática';

export default function NotaFiscalScreen() {
  const { orgId, role } = useOrg();
  const settings = useNfseSettings(orgId);
  if (settings.isPending) {
    return (
      <Screen>
        <DetailBar title={TITLE} />
        <Skeleton />
      </Screen>
    );
  }
  if (settings.error) {
    return (
      <Screen>
        <DetailBar title={TITLE} />
        <ErrorCard
          message={`${friendlyError(settings.error)} Se o problema continuar, o banco ainda precisa da atualização da nota fiscal.`}
          onRetry={() => settings.refetch()}
        />
      </Screen>
    );
  }
  return <NotaFiscal key={settings.data?.certificate_expires_at ?? 'novo'} orgId={orgId} canEdit={role !== 'member'} current={settings.data} />;
}

function NotaFiscal({ orgId, canEdit, current }: { orgId: string; canEdit: boolean; current: NfseSettings | null }) {
  const connected = !!current?.connected;
  const [editing, setEditing] = useState(!connected);

  return (
    <Screen>
      <DetailBar title={TITLE} />
      {connected && current && !editing ? (
        <Connected orgId={orgId} canEdit={canEdit} settings={current} onEdit={() => setEditing(true)} />
      ) : (
        <>
          <Text style={styles.body}>
            Com o certificado digital da empresa conectado, a nota sai com um toque no atendimento, sem abrir o site do governo.
          </Text>
          <Card>
            <Text style={styles.cardTitle}>Por que certificado e não senha?</Text>
            <Text style={styles.body}>
              O governo só deixa outro sistema emitir a nota com o certificado digital A1 do CNPJ (um arquivo .pfx ou .p12). O login do
              gov.br não funciona para isso. A senha do certificado serve só para abrir o arquivo agora e não fica guardada.
            </Text>
            <Text style={styles.hint}>
              Ainda não tem? Peça um e-CNPJ A1 numa certificadora (Serasa, Certisign, Valid e outras). Até lá, use o jeito de copiar e colar no
              Emissor, no próprio atendimento.
            </Text>
          </Card>
          {canEdit ? (
            <SetupForm orgId={orgId} current={current} onDone={connected ? () => setEditing(false) : undefined} />
          ) : (
            <Text style={styles.body}>Só o dono ou um administrador pode conectar o certificado.</Text>
          )}
        </>
      )}
    </Screen>
  );
}

function Connected({ orgId, canEdit, settings, onEdit }: { orgId: string; canEdit: boolean; settings: NfseSettings; onEdit: () => void }) {
  const test = useTestNfse(orgId);
  const disconnect = useDisconnectNfse(orgId);
  const toast = useToast();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const expires = settings.certificate_expires_at ? new Date(settings.certificate_expires_at) : null;
  const soon = certificateExpiresSoon(settings.certificate_expires_at);

  return (
    <>
      <Card>
        <View style={styles.titleRow}>
          <CheckCircle2 size={20} color={colors.success} />
          <Text style={styles.cardTitle}>Conectado ao Emissor Nacional</Text>
        </View>
        <Info label="Empresa" value={`${settings.certificate_holder ?? ''} · CNPJ ${formatDocument(settings.cnpj)}`} />
        <Info label="Cidade" value={settings.city_name} />
        <Info label="Serviço" value={`${formatServiceCode(settings.service_code)}${serviceCodeLabel(settings.service_code) ? ` · ${serviceCodeLabel(settings.service_code)}` : ''}`} />
        {expires ? (
          <Info
            label="Certificado vale até"
            value={expires.toLocaleDateString('pt-BR')}
            warn={soon ? 'Vence em menos de 30 dias. Renove e envie o novo arquivo.' : undefined}
          />
        ) : null}
        <Text style={styles.hint}>Agora, no atendimento, toque em “Emitir nota agora”.</Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Testar</Text>
        <Text style={styles.body}>Manda uma nota de R$ 1,00 para o ambiente de testes do governo. Ela não vale como nota e não conta no seu faturamento.</Text>
        {message ? <Text style={[styles.body, { color: message.ok ? colors.success : colors.danger }]}>{message.text}</Text> : null}
        <Button
          size="medium"
          variant="tint"
          label="Fazer nota de teste"
          loading={test.isPending}
          onPress={() => {
            setMessage(null);
            test.mutate(undefined, {
              onSuccess: (r) => setMessage({ ok: true, text: `Deu certo! O governo aceitou a nota de teste nº ${r.number}.` }),
              onError: (e) => setMessage({ ok: false, text: nfseErrorText(e) }),
            });
          }}
        />
      </Card>

      {canEdit ? (
        <>
          <Button variant="outline" label="Mudar cidade, serviço ou certificado" onPress={onEdit} />
          {confirmOff ? (
            <Card>
              <Text style={styles.body}>Desligar apaga o certificado guardado. As notas já emitidas continuam no app.</Text>
              <Button variant="ink" size="medium" label="Voltar" onPress={() => setConfirmOff(false)} />
              <Button
                size="medium"
                label="Desligar"
                loading={disconnect.isPending}
                onPress={() =>
                  disconnect.mutate(undefined, {
                    onSuccess: () => toast('Nota fiscal automática desligada'),
                    onError: (e) => toast(nfseErrorText(e)),
                  })
                }
              />
            </Card>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setConfirmOff(true)} style={styles.link}>
              <Text style={styles.linkText}>Desligar a nota automática</Text>
            </Pressable>
          )}
        </>
      ) : null}
    </>
  );
}

function SetupForm({ orgId, current, onDone }: { orgId: string; current: NfseSettings | null; onDone?: () => void }) {
  const connect = useConnectNfse(orgId);
  const update = useUpdateNfseSettings(orgId);
  const toast = useToast();
  const connected = !!current?.connected;
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [password, setPassword] = useState('');
  const [cep, setCep] = useState('');
  const [city, setCity] = useState<{ name: string; ibge: string } | null>(current ? { name: current.city_name, ibge: current.city_ibge } : null);
  const [cityLoading, setCityLoading] = useState(false);
  const [code, setCode] = useState(current?.service_code ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);

  const pickFile = async () => {
    setErrs((e) => ({ ...e, file: undefined }));
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/x-pkcs12', 'application/octet-stream', '*/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    if (!/\.(pfx|p12)$/i.test(asset.name)) return setErrs((e) => ({ ...e, file: 'Escolha o arquivo do certificado (.pfx ou .p12).' }));
    if (asset.size && asset.size > 25_000) return setErrs((e) => ({ ...e, file: 'Arquivo grande demais para um certificado A1.' }));
    try {
      setFile({ name: asset.name, base64: await fileToBase64(asset.uri, asset.file) });
    } catch {
      setErrs((e) => ({ ...e, file: 'Não conseguimos ler o arquivo. Tente de novo.' }));
    }
  };

  const findCity = async (text: string) => {
    setCep(text);
    const digits = text.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCityLoading(true);
    setErrs((e) => ({ ...e, city: undefined }));
    try {
      const found = await cityFromCep(digits);
      if (found) setCity(found);
      else setErrs((e) => ({ ...e, city: 'CEP não encontrado. Confira os números.' }));
    } catch {
      setErrs((e) => ({ ...e, city: 'Sem conexão para buscar o CEP. Tente de novo.' }));
    } finally {
      setCityLoading(false);
    }
  };

  const onSave = async () => {
    const next: Record<string, string | undefined> = {};
    const changingCert = !connected || !!file;
    if (changingCert && !file) next.file = 'Escolha o arquivo do certificado.';
    if (changingCert && !password) next.password = 'Digite a senha do certificado.';
    if (!city) next.city = 'Digite o CEP da empresa para achar a cidade.';
    if (serviceCodeDigits(code).length !== 6) next.code = 'Escolha o serviço ou digite o código com 6 números.';
    setErrs(next);
    if (Object.values(next).some(Boolean) || !city) return;
    setError(null);
    const input = { cityIbge: city.ibge, cityName: city.name, serviceCode: serviceCodeDigits(code) };
    try {
      if (changingCert && file) {
        const r = await connect.mutateAsync({ ...input, pfxBase64: file.base64, password });
        toast(`Certificado de ${r.holder} conectado`);
      } else {
        await update.mutateAsync(input);
        toast('Nota fiscal atualizada');
      }
      onDone?.();
    } catch (e) {
      setError(nfseErrorText(e));
    }
  };

  const codeLabel = serviceCodeLabel(serviceCodeDigits(code));

  return (
    <>
      <Card>
        <Text style={styles.cardTitle}>1. Certificado digital A1</Text>
        {connected ? <Text style={styles.hint}>Só escolha um arquivo se quiser trocar o certificado (por exemplo, quando renovar).</Text> : null}
        <Pressable accessibilityRole="button" onPress={pickFile} style={({ pressed }) => [styles.fileRow, pressed && styles.pressed]}>
          <FileKey size={20} color={colors.primaryText} />
          <Text style={[styles.fileText, !file && styles.filePlaceholder]} numberOfLines={1}>
            {file ? file.name : 'Escolher arquivo .pfx ou .p12'}
          </Text>
        </Pressable>
        {errs.file ? <Text style={styles.error}>{errs.file}</Text> : null}
        {!connected || file ? (
          <TextField
            label="Senha do certificado"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            error={errs.password}
            hint="A senha que você criou ao instalar o certificado. Não fica guardada."
          />
        ) : null}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>2. Cidade da empresa</Text>
        <TextField
          label="CEP da empresa"
          value={cep}
          onChangeText={findCity}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={9}
          placeholder="00000-000"
          error={errs.city}
          hint={cityLoading ? 'Buscando a cidade…' : city ? `Cidade: ${city.name}` : 'A nota sai pela prefeitura desta cidade.'}
        />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>3. Serviço que você presta</Text>
        <Button size="medium" variant="tint" label={codeLabel ?? 'Escolher na lista'} onPress={() => setPickerOpen(true)} />
        <TextField
          label="Código de tributação nacional"
          value={code.length === 6 ? formatServiceCode(code) : code}
          onChangeText={(t) => setCode(serviceCodeDigits(t).slice(0, 6))}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={8}
          placeholder="00.00.00"
          error={errs.code}
          hint="Não achou na lista? Use o mesmo código das notas que você já emitiu no Emissor."
        />
      </Card>

      <FormError message={error} />
      <Button label={connected && !file ? 'Salvar' : 'Conectar'} onPress={onSave} loading={connect.isPending || update.isPending} />
      {onDone ? <Button variant="outline" label="Voltar" onPress={onDone} /> : null}

      <PickerModal
        visible={pickerOpen}
        title="Serviço"
        searchPlaceholder="Buscar serviço"
        options={COMMON_SERVICE_CODES.map((c) => ({ id: c.code, title: c.label, subtitle: formatServiceCode(c.code) }))}
        selectedId={serviceCodeDigits(code) || null}
        emptyText="Nenhum serviço com esse nome. Digite o código no campo."
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          if (id) setCode(id);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

function Info({ label, value, warn }: { label: string; value: string; warn?: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
      {warn ? <Text style={styles.error}>{warn}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  hint: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, lineHeight: 17 },
  error: { fontFamily: fonts.semibold, fontSize: 12, color: colors.danger },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  info: { gap: 2 },
  infoLabel: { fontFamily: fonts.bold, fontSize: 11, color: colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primarySoft,
    backgroundColor: colors.primaryTint,
  },
  fileText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  filePlaceholder: { color: colors.primaryText },
  pressed: { opacity: 0.7 },
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontFamily: fonts.bold, fontSize: 14, color: colors.danger },
});
