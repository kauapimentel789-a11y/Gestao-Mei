// Marcar um atendimento: cliente, serviço, valor, data, hora e duração.
// Choque de horário não bloqueia: o app avisa e pede confirmação.
import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { PickerModal } from '@/components/PickerModal';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAgenda, useBookAppointment } from '@/features/agenda/api';
import { conflictsWith, DEFAULT_MINUTES, durationLabel } from '@/features/agenda/logic';
import { type Customer, useCustomer } from '@/features/customers/api';
import { CustomerPicker } from '@/features/customers/CustomerPicker';
import { useOrg } from '@/features/organizations/useOrg';
import { useProducts } from '@/features/products/api';
import type { Product } from '@/features/products/types';
import { formatDateBR, formatTimeBR, parseDateTimeBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents, parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

const DURATIONS = [15, 30, 45, 60, 90, 120];
const centsToText = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

export default function NewAppointmentScreen() {
  const { data, clienteId } = useLocalSearchParams<{ data?: string; clienteId?: string }>();
  const { orgId, config } = useOrg();
  const noun = config.clientNoun;
  const toast = useToast();
  const book = useBookAppointment(orgId);
  const services = useProducts(orgId, { types: ['service'], activeOnly: true });
  const preset = useCustomer(orgId, clienteId ?? '');

  const [key] = useState(newId);
  const [picked, setCustomer] = useState<Customer | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [service, setService] = useState<Product | null>(null);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(data ?? formatDateBR(new Date()));
  const [time, setTime] = useState('');
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmConflict, setConfirmConflict] = useState(false);

  const customer = picked ?? preset.data ?? null;

  const at = time.trim() ? parseDateTimeBR(date, time) : null;
  const day = parseDateTimeBR(date, '00:00');
  const dayStart = day ?? new Date();
  const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
  const agenda = useAgenda(orgId, dayStart.toISOString(), dayEnd.toISOString());
  const conflicts = useMemo(() => (at ? conflictsWith(agenda.data ?? [], at, minutes) : []), [agenda.data, at, minutes]);
  const durations = DURATIONS.includes(minutes) ? DURATIONS : [...DURATIONS, minutes].sort((a, b) => a - b);

  const chooseService = (p: Product | null) => {
    setService(p);
    if (p) {
      setPrice(centsToText(p.price_cents));
      if (p.duration_minutes) setMinutes(p.duration_minutes);
    }
  };

  const save = async () => {
    setError(null);
    if (!customer) return setError(`Escolha o ${noun}.`);
    if (!service && !description.trim()) return setError('Escolha o serviço ou descreva o atendimento.');
    const cents = price.trim() ? parseBRLToCents(price) : service ? null : 0;
    if (price.trim() && cents === null) return setError('Valor inválido. Ex.: 150,00');
    if (!day) return setError('Data inválida. Use dd/mm/aaaa.');
    if (!at) return setError('Informe a hora (hh:mm).');
    if (conflicts.length > 0 && !confirmConflict) {
      setConfirmConflict(true);
      return;
    }
    try {
      const o = await book.mutateAsync({
        idempotencyKey: key,
        customerId: customer.id,
        at,
        minutes,
        productId: service?.id ?? null,
        description: description.trim(),
        priceCents: cents,
        notes: notes.trim(),
      });
      toast(`Marcado: ${formatDateBR(at)} às ${formatTimeBR(at)}`);
      router.replace({ pathname: '/pedidos/[id]', params: { id: o.id } });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title={`Novo ${config.orderNoun}`} />

      <Card>
        <Text style={styles.label}>{noun[0]!.toUpperCase() + noun.slice(1)}</Text>
        <Pressable accessibilityRole="button" onPress={() => setCustomerOpen(true)} style={styles.select}>
          <Text style={[styles.selectText, !customer && styles.placeholder]}>{customer?.name ?? `Escolher ${noun}`}</Text>
          <ChevronRight size={18} color={colors.gray400} />
        </Pressable>

        <Text style={styles.label}>Serviço</Text>
        <Pressable accessibilityRole="button" onPress={() => setServiceOpen(true)} style={styles.select}>
          <Text style={[styles.selectText, !service && styles.placeholder]}>{service?.name ?? 'Escolher do cadastro (opcional)'}</Text>
          <ChevronRight size={18} color={colors.gray400} />
        </Pressable>
        {!service ? (
          <TextField label="Ou descreva o atendimento" value={description} onChangeText={setDescription} placeholder="Ex.: Consulta inicial" maxLength={160} />
        ) : null}
        <TextField
          label="Valor"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="0,00"
          hint={service?.price_cents != null ? `Preço do cadastro: ${formatCents(service.price_cents)}` : 'Deixe vazio se não for cobrar.'}
        />
      </Card>

      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField
              label="Data"
              value={date}
              onChangeText={(t) => {
                setDate(t);
                setConfirmConflict(false);
              }}
              placeholder="dd/mm/aaaa"
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={styles.time}>
            <TextField
              label="Hora"
              value={time}
              onChangeText={(t) => {
                setTime(t);
                setConfirmConflict(false);
              }}
              placeholder="hh:mm"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>
        <Text style={styles.label}>Duração</Text>
        <Chips
          accessibilityLabel="Duração"
          value={String(minutes)}
          onChange={(v) => {
            setMinutes(Number(v));
            setConfirmConflict(false);
          }}
          options={durations.map((d) => ({ value: String(d), label: durationLabel(d) }))}
        />
        {conflicts.length > 0 ? (
          <View style={styles.warning}>
            <View style={styles.warningTitle}>
              <AlertTriangle size={16} color={colors.primaryText} />
              <Text style={styles.warningText}>Esse horário se choca com:</Text>
            </View>
            {conflicts.map((c) => (
              <Text key={c.id} style={styles.warningItem}>
                {formatTimeBR(new Date(c.scheduled_for!))} · {c.customer_name ?? `Sem ${noun}`} ({durationLabel(c.scheduled_minutes)})
              </Text>
            ))}
          </View>
        ) : null}
      </Card>

      <Card>
        <TextField label="Observação (opcional)" value={notes} onChangeText={setNotes} placeholder="Ex.: trazer exames" maxLength={2000} multiline />
      </Card>

      <FormError message={error} />
      <Button
        label={confirmConflict ? 'Marcar mesmo assim' : 'Marcar horário'}
        onPress={save}
        loading={book.isPending}
        accessibilityHint={confirmConflict ? 'O horário se choca com outro atendimento' : undefined}
      />

      <CustomerPicker
        orgId={orgId}
        visible={customerOpen}
        selectedId={customer?.id ?? null}
        noun={noun}
        allowNone={false}
        onClose={() => setCustomerOpen(false)}
        onSelect={(c) => {
          setCustomer(c);
          setCustomerOpen(false);
        }}
      />
      <PickerModal
        visible={serviceOpen}
        title="Serviço"
        searchPlaceholder="Buscar serviço"
        options={(services.data ?? []).map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: [p.price_cents != null ? formatCents(p.price_cents) : null, p.duration_minutes ? durationLabel(p.duration_minutes) : null]
            .filter(Boolean)
            .join(' · '),
        }))}
        loading={services.isPending}
        selectedId={service?.id ?? null}
        noneLabel="Outro (descrever)"
        emptyText="Nenhum serviço cadastrado. Cadastre em Configurações → Serviços e materiais, ou descreva o atendimento."
        onClose={() => setServiceOpen(false)}
        onSelect={(id) => {
          chooseService((services.data ?? []).find((p) => p.id === id) ?? null);
          setServiceOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    gap: 8,
  },
  selectText: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  placeholder: { color: colors.gray400, fontFamily: fonts.medium },
  row: { flexDirection: 'row', gap: 10 },
  time: { width: 110 },
  warning: { gap: 4, padding: 12, borderRadius: 14, backgroundColor: colors.primaryTint },
  warningTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warningText: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  warningItem: { fontFamily: fonts.medium, fontSize: 13, color: colors.primaryText },
});
