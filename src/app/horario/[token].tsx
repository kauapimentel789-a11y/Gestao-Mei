import { useLocalSearchParams } from 'expo-router';
import { CalendarClock, CalendarDays, CalendarX, CheckCircle2, MapPin, MessageCircle, XCircle } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FadeIn } from '@/components/motion';
import { formatDuration, formatLongDate, whatsappLink } from '@/features/booking/logic';
import { AREA_ICON, Calendar, GhostButton, mapsLink, Panel, PrimaryButton, SlotGrid, SummaryRow } from '@/features/booking/site/parts';
import { site, siteFonts as f } from '@/features/booking/site/theme';
import { PublicOrderError, useBookingManage, useCancelBooking, useManageSlots, useReschedule } from '@/features/public-order/api';
import { formatCents } from '@/lib/money';

import type { BookingManage } from '../../../supabase/functions/_shared/public-order';

type Mode = 'view' | 'reschedule' | 'cancel';

/**
 * Link do cliente (/horario/<código>): vê o horário marcado pelo site,
 * remarca ou cancela até 2 horas antes. Sem login; só fala com a Edge Function.
 */
export default function ManageBookingPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const code = String(token ?? '').toLowerCase();
  const query = useBookingManage(code);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {query.isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={site.accent} size="large" />
        </View>
      ) : query.error || !query.data ? (
        <View style={styles.center}>
          <FadeIn style={styles.emptyBox}>
            <CalendarX size={48} color={site.accent} />
            <Text style={styles.title}>
              {query.error instanceof PublicOrderError && query.error.code === 'not_found' ? 'Link indisponível' : 'Não foi possível abrir'}
            </Text>
            <Text style={styles.muted}>
              {query.error instanceof PublicOrderError && query.error.code === 'not_found'
                ? 'Este link não existe mais ou a empresa desligou o agendamento pelo site. Fale direto com a empresa.'
                : 'Tente de novo em instantes.'}
            </Text>
          </FadeIn>
        </View>
      ) : (
        <Manage token={code} data={query.data} />
      )}
    </SafeAreaView>
  );
}

function Manage({ token, data }: { token: string; data: BookingManage }) {
  const { width } = useWindowDimensions();
  const medium = width >= 720;
  const [mode, setMode] = useState<Mode>('view');
  const [notice, setNotice] = useState<string | null>(null);
  const Icon = AREA_ICON[data.business.practice_area ?? 'other'];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingHorizontal: medium ? 28 : 16 }]}>
      <View style={styles.container}>
        <FadeIn style={styles.brand}>
          <View style={styles.logo}>
            <Icon size={20} color={site.accent} />
          </View>
          <Text style={styles.brandName}>{data.business.name}</Text>
        </FadeIn>

        <FadeIn delay={80}>
          <Text style={styles.kicker}>MEU HORÁRIO</Text>
          <Text style={styles.title} accessibilityRole="header">
            {data.status === 'cancelled' ? 'Horário cancelado' : data.status === 'past' ? 'Atendimento encerrado' : 'Seu horário está marcado'}
          </Text>
        </FadeIn>

        {notice ? (
          <FadeIn style={styles.notice}>
            <CheckCircle2 size={18} color={site.success} />
            <Text style={styles.noticeText}>{notice}</Text>
          </FadeIn>
        ) : null}

        <FadeIn delay={140}>
          <Panel icon={CalendarClock} title={`Atendimento nº ${data.number}`}>
            <SummaryRow label="Serviço" value={data.service} />
            {data.professional ? <SummaryRow label="Profissional" value={data.professional} /> : null}
            <SummaryRow label="Data e horário" value={data.label} />
            <SummaryRow label="Duração" value={formatDuration(data.minutes)} />
            <SummaryRow label="Valor" value={formatCents(data.total_cents)} strong />
          </Panel>
        </FadeIn>

        {mode === 'reschedule' ? (
          <Reschedule
            token={token}
            data={data}
            onBack={() => setMode('view')}
            onDone={(label) => {
              setMode('view');
              setNotice(`Pronto! Seu novo horário é ${label}.`);
            }}
          />
        ) : mode === 'cancel' ? (
          <ConfirmCancel
            token={token}
            onBack={() => setMode('view')}
            onDone={() => {
              setMode('view');
              setNotice('Seu horário foi cancelado. Se quiser, marque outro pela página da empresa.');
            }}
          />
        ) : data.can_change ? (
          <FadeIn delay={200} style={styles.actions}>
            <PrimaryButton label="Remarcar" icon={CalendarDays} onPress={() => setMode('reschedule')} />
            <GhostButton label="Cancelar horário" icon={XCircle} onPress={() => setMode('cancel')} />
          </FadeIn>
        ) : data.status === 'active' ? (
          <Text style={styles.muted}>Faltam menos de 2 horas. Para mudar agora, fale direto com {data.business.name}.</Text>
        ) : null}

        <View style={styles.contact}>
          {data.business.whatsapp ? (
            <GhostButton
              label="Falar no WhatsApp"
              icon={MessageCircle}
              onPress={() =>
                Linking.openURL(whatsappLink(data.business.whatsapp!, `Olá! Sobre meu atendimento nº ${data.number} (${data.service}).`))
              }
            />
          ) : null}
          {data.business.address ? (
            <GhostButton label="Como chegar" icon={MapPin} onPress={() => Linking.openURL(mapsLink(data.business.address!))} />
          ) : null}
        </View>

        <Text style={styles.footer}>Agendamento por Gestão Fácil</Text>
      </View>
    </ScrollView>
  );
}

function Reschedule({
  token,
  data,
  onBack,
  onDone,
}: {
  token: string;
  data: BookingManage;
  onBack: () => void;
  onDone: (label: string) => void;
}) {
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ at: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slots = useManageSlots(token, day, true);
  const save = useReschedule(token);

  const submit = () => {
    if (!slot || !day) return;
    setError(null);
    save.mutate(slot.at, {
      onSuccess: (next) => onDone(next.label ?? `${formatLongDate(day)} às ${slot.label}`),
      onError: (e) => {
        setError(e instanceof Error ? e.message : 'Não foi possível remarcar.');
        if (e instanceof PublicOrderError && e.code === 'slot_unavailable') {
          setSlot(null);
          slots.refetch();
        }
      },
    });
  };

  return (
    <FadeIn>
      <Panel icon={CalendarDays} title="Escolha o novo dia e horário">
        <Calendar
          page={data}
          value={day}
          onChange={(d) => {
            setDay(d);
            setSlot(null);
          }}
        />
        {!day ? (
          <Text style={styles.hint}>Toque num dia em destaque no calendário.</Text>
        ) : slots.isPending ? (
          <ActivityIndicator color={site.accent} />
        ) : slots.error ? (
          <Text style={styles.error}>{slots.error instanceof Error ? slots.error.message : 'Não foi possível carregar os horários.'}</Text>
        ) : slots.data && slots.data.slots.length > 0 ? (
          <SlotGrid slots={slots.data.slots} value={slot?.at ?? null} onChange={setSlot} />
        ) : (
          <Text style={styles.hint}>Nenhum horário livre neste dia. Escolha outro.</Text>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <PrimaryButton label="Confirmar novo horário" icon={CalendarClock} onPress={submit} disabled={!slot} loading={save.isPending} />
          <GhostButton label="Voltar" onPress={onBack} />
        </View>
      </Panel>
    </FadeIn>
  );
}

function ConfirmCancel({ token, onBack, onDone }: { token: string; onBack: () => void; onDone: () => void }) {
  const cancel = useCancelBooking(token);
  const [error, setError] = useState<string | null>(null);
  return (
    <FadeIn>
      <Panel icon={XCircle} title="Cancelar este horário?">
        <Text style={styles.muted}>O horário fica livre para outra pessoa. Isso não pode ser desfeito por aqui.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <PrimaryButton
            label="Sim, cancelar"
            icon={XCircle}
            loading={cancel.isPending}
            onPress={() => {
              setError(null);
              cancel.mutate(undefined, {
                onSuccess: onDone,
                onError: (e) => setError(e instanceof Error ? e.message : 'Não foi possível cancelar.'),
              });
            }}
          />
          <GhostButton label="Manter horário" onPress={onBack} />
        </View>
      </Panel>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: site.bg },
  scroll: { flex: 1, backgroundColor: site.bg },
  content: { paddingVertical: 28 },
  container: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: site.bg },
  emptyBox: { alignItems: 'center', gap: 10, maxWidth: 420 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: site.accentLine,
    backgroundColor: site.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontFamily: f.display, fontSize: 20, color: site.text },
  kicker: { fontFamily: f.bold, fontSize: 12, letterSpacing: 1.6, color: site.accentText, marginBottom: 6 },
  title: { fontFamily: f.display, fontSize: 30, color: site.text },
  muted: { fontFamily: f.medium, fontSize: 15, lineHeight: 22, color: site.muted },
  hint: { fontFamily: f.medium, fontSize: 13, color: site.faint },
  error: { fontFamily: f.semibold, fontSize: 13, color: site.danger },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  noticeText: { flex: 1, fontFamily: f.semibold, fontSize: 14, color: site.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  contact: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderTopColor: site.border, paddingTop: 20 },
  footer: { fontFamily: f.medium, fontSize: 12, color: site.faint, textAlign: 'center', marginTop: 12 },
});
