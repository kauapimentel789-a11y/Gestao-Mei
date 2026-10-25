import { useLocalSearchParams } from 'expo-router';
import { CalendarCheck, CalendarX } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { bookingDays, formatDuration } from '@/features/booking/logic';
import { PublicOrderError, useBook, useBookingPage, useBookingSlots } from '@/features/public-order/api';
import { newId } from '@/lib/ids';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

import { type BookingPage, bookRequest } from '../../../supabase/functions/_shared/public-order';

/** Página pública de agendamento (plano Pro Max): o cliente da empresa abre sem login. */
export default function PublicBookingPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const page = useBookingPage(String(slug ?? ''));

  return (
    <Screen>
      {page.isPending ? (
        <Skeleton rows={4} />
      ) : page.error || !page.data ? (
        <EmptyState
          icon={CalendarX}
          title={page.error instanceof PublicOrderError && page.error.code === 'not_found' ? 'Agendamento indisponível' : 'Não foi possível abrir'}
          description={page.error instanceof Error ? page.error.message : undefined}
        />
      ) : (
        <BookingForm page={page.data} />
      )}
    </Screen>
  );
}

function BookingForm({ page }: { page: BookingPage }) {
  const book = useBook();
  const [key, setKey] = useState(newId);
  const [serviceId, setServiceId] = useState<string | null>(page.services.length === 1 ? page.services[0].id : null);
  const days = bookingDays(page.today, page.last_day, page.weekdays);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ at: string; label: string } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const slots = useBookingSlots(page.slug, serviceId, day);
  const service = page.services.find((s) => s.id === serviceId) ?? null;

  if (book.data) {
    return (
      <View style={styles.done}>
        <CalendarCheck size={56} color={colors.primary} />
        <Text style={styles.doneTitle} accessibilityRole="header">
          Horário marcado
        </Text>
        <Text style={styles.doneText}>
          {book.data.service} em {page.name}, {book.data.label}. Valor: {formatCents(book.data.total_cents)}. Se precisar mudar, fale com{' '}
          {page.name} pelo WhatsApp.
        </Text>
      </View>
    );
  }

  if (page.services.length === 0 || days.length === 0) {
    return (
      <>
        <Hero name={page.name} />
        <EmptyState icon={CalendarX} title="Sem horários no momento" description={`${page.name} ainda não abriu horários para agendar pelo site.`} />
      </>
    );
  }

  const submit = () => {
    setError(null);
    const parsed = bookRequest.safeParse({
      action: 'book',
      slug: page.slug,
      idempotency_key: key,
      product_id: serviceId ?? '',
      starts_at: slot?.at ?? '',
      name,
      phone,
      notes: notes.trim() || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os dados.');
      return;
    }
    const { action: _action, ...input } = parsed.data;
    book.mutate(input, {
      onError: (e) => {
        setError(e instanceof Error ? e.message : 'Não foi possível agendar.');
        if (e instanceof PublicOrderError && e.code === 'slot_unavailable') {
          // Outro cliente pegou o horário: escolhe de novo, com nova chave.
          setSlot(null);
          setKey(newId());
          slots.refetch();
        }
      },
    });
  };

  return (
    <>
      <Hero name={page.name} />

      <Card>
        <Text style={styles.cardTitle}>1. Serviço</Text>
        {page.services.map((s, i) => {
          const selected = s.id === serviceId;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                setServiceId(s.id);
                setSlot(null);
              }}
              style={[styles.service, i > 0 && styles.divider]}
            >
              <View style={[styles.radio, selected && styles.radioOn]} />
              <View style={styles.flex}>
                <Text style={styles.serviceName}>{s.name}</Text>
                {s.description ? <Text style={styles.muted}>{s.description}</Text> : null}
                <Text style={styles.price}>
                  {formatCents(s.price_cents)} · {formatDuration(s.duration_minutes)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </Card>

      {service ? (
        <Card>
          <Text style={styles.cardTitle}>2. Dia</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {days.map((d) => {
              const selected = d.date === day;
              return (
                <Pressable
                  key={d.date}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${d.weekday} ${d.label}`}
                  onPress={() => {
                    setDay(d.date);
                    setSlot(null);
                  }}
                  style={[styles.day, selected && styles.chipOn]}
                >
                  <Text style={[styles.dayWeek, selected && styles.chipTextOn]}>{d.weekday}</Text>
                  <Text style={[styles.dayDate, selected && styles.chipTextOn]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {day ? (
            <>
              <Text style={styles.cardTitle}>3. Horário</Text>
              {slots.isPending ? (
                <Skeleton rows={1} />
              ) : slots.error ? (
                <Text style={styles.body}>{slots.error instanceof Error ? slots.error.message : 'Não foi possível carregar os horários.'}</Text>
              ) : slots.data && slots.data.slots.length > 0 ? (
                <View style={styles.slots}>
                  {slots.data.slots.map((s) => {
                    const selected = s.at === slot?.at;
                    return (
                      <Pressable
                        key={s.at}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        onPress={() => setSlot(s)}
                        style={[styles.slot, selected && styles.chipOn]}
                      >
                        <Text style={[styles.slotText, selected && styles.chipTextOn]}>{s.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.body}>Nenhum horário livre neste dia. Escolha outro.</Text>
              )}
            </>
          ) : null}
        </Card>
      ) : null}

      {slot ? (
        <Card>
          <Text style={styles.cardTitle}>4. Seus dados</Text>
          <TextField label="Nome" value={name} onChangeText={setName} autoComplete="name" maxLength={120} />
          <TextField label="WhatsApp com DDD" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" maxLength={30} />
          <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
        </Card>
      ) : null}

      <FormError message={error} />
      <Button
        label={slot && service ? `Confirmar ${slot.label} · ${formatCents(service.price_cents)}` : 'Escolha o serviço, o dia e o horário'}
        disabled={!slot || !service}
        loading={book.isPending}
        onPress={submit}
      />
      <Text style={styles.note}>Seus dados vão só para {page.name}, para confirmar o atendimento.</Text>
    </>
  );
}

function Hero({ name }: { name: string }) {
  return (
    <View style={styles.hero}>
      <View style={styles.glow} pointerEvents="none" />
      <Text style={styles.kicker}>AGENDAMENTO</Text>
      <Text style={styles.heroTitle} accessibilityRole="header">
        {name}
      </Text>
      <Text style={styles.heroSub}>Escolha o serviço e um horário livre. O horário fica reservado na hora.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  hero: { backgroundColor: colors.ink, borderRadius: radius.hero, padding: 20, gap: 6, overflow: 'hidden' },
  glow: { position: 'absolute', top: -120, right: -90, width: 240, height: 240, borderRadius: 120, backgroundColor: colors.primary, opacity: 0.45 },
  kicker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 2.6, color: colors.primary },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.white },
  heroSub: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray300, lineHeight: 19 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600 },
  service: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 48 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.gray300 },
  radioOn: { borderColor: colors.primary, borderWidth: 6 },
  serviceName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  price: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.primaryText },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  dayRow: { gap: 8, paddingVertical: 2 },
  day: { width: 60, paddingVertical: 10, borderRadius: radius.input, backgroundColor: colors.gray100, alignItems: 'center', gap: 2 },
  dayWeek: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500 },
  dayDate: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { minWidth: 72, minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  slotText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  chipOn: { backgroundColor: colors.primaryTint },
  chipTextOn: { color: colors.primaryText },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
  done: { alignItems: 'center', gap: 12, paddingTop: 80, paddingHorizontal: 8 },
  doneTitle: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink },
  doneText: { fontFamily: fonts.medium, fontSize: 15, color: colors.gray600, textAlign: 'center', lineHeight: 22 },
});
