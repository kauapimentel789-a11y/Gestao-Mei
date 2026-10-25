import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { CalendarCheck, CalendarClock, CalendarDays, CalendarX, Check, Clock, Copy, Lock, MessageCircle, RotateCcw, User } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, ScrollView, type ScrollViewInstance, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FadeIn } from '@/components/motion';
import { formatDuration, formatLongDate, whatsappLink } from '@/features/booking/logic';
import {
  AREA_ICON,
  Calendar,
  DarkField,
  Features,
  Footer,
  GhostButton,
  Header,
  Hero,
  Panel,
  PrimaryButton,
  QuickTiles,
  ServiceOption,
  SlotGrid,
  Steps,
  SummaryRow,
} from '@/features/booking/site/parts';
import { MAX_WIDTH, site, siteFonts as f } from '@/features/booking/site/theme';
import { PublicOrderError, useBook, useBookingPage, useBookingSlots } from '@/features/public-order/api';
import { newId } from '@/lib/ids';
import { formatCents } from '@/lib/money';
import { bookingManageUrl } from '@/lib/publicLink';

import { type BookingPage, type BookingResult, bookRequest } from '../../../supabase/functions/_shared/public-order';

type Section = 'servicos' | 'agendar' | 'contato';

/**
 * Página pública de agendamento (plano Pro Max): o cliente da empresa abre sem
 * login. Só conversa com a Edge Function; nada do sistema do dono passa por aqui.
 */
export default function PublicBookingPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const page = useBookingPage(String(slug ?? ''));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {page.isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={site.accent} size="large" />
        </View>
      ) : page.error || !page.data ? (
        <View style={styles.center}>
          <FadeIn style={styles.emptyBox}>
            <CalendarX size={48} color={site.accent} />
            <Text style={styles.emptyTitle}>
              {page.error instanceof PublicOrderError && page.error.code === 'not_found' ? 'Agendamento indisponível' : 'Não foi possível abrir'}
            </Text>
            <Text style={styles.emptyText}>{page.error instanceof Error ? page.error.message : 'Tente de novo em instantes.'}</Text>
          </FadeIn>
        </View>
      ) : (
        <Site page={page.data} />
      )}
    </SafeAreaView>
  );
}

function Site({ page }: { page: BookingPage }) {
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const medium = width >= 720;
  const scroll = useRef<ScrollViewInstance>(null);
  const anchors = useRef<Record<Section, number>>({ servicos: 0, agendar: 0, contato: 0 });
  const [round, setRound] = useState(0);
  const [done, setDone] = useState<BookingResult | null>(null);

  const go = (to: Section) => scroll.current?.scrollTo({ y: Math.max(0, anchors.current[to] - 12), animated: true });

  useEffect(() => {
    if (done) scroll.current?.scrollTo({ y: Math.max(0, anchors.current.agendar - 12), animated: true });
  }, [done]);

  return (
    <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={[styles.container, { paddingHorizontal: medium ? 28 : 16 }]}>
        <Header page={page} wide={wide} onNav={go} />
        <Hero page={page} wide={wide} onBook={() => go('agendar')} />
        {!wide ? <QuickTiles page={page} onNav={go} /> : null}

        <View
          onLayout={(e) => {
            anchors.current.agendar = e.nativeEvent.layout.y;
          }}
        >
          {done ? (
            <Done
              page={page}
              result={done}
              onAgain={() => {
                setDone(null);
                setRound(round + 1);
              }}
            />
          ) : (
            <BookingFlow key={round} page={page} wide={wide} medium={medium} onDone={setDone} onServicesLayout={(y) => {
                anchors.current.servicos = y;
              }} />
          )}
        </View>

        <View style={styles.featuresBox}>
          <Features wide={medium} />
        </View>

        <View
          onLayout={(e) => {
            anchors.current.contato = e.nativeEvent.layout.y;
          }}
        >
          <Footer page={page} wide={medium} />
        </View>
      </View>
    </ScrollView>
  );
}

function BookingFlow({
  page,
  wide,
  medium,
  onDone,
  onServicesLayout,
}: {
  page: BookingPage;
  wide: boolean;
  medium: boolean;
  onDone: (r: BookingResult) => void;
  /** Posição da lista de serviços dentro da seção, para o menu "Serviços". */
  onServicesLayout: (y: number) => void;
}) {
  const book = useBook();
  const [key, setKey] = useState(newId);
  const [serviceId, setServiceId] = useState<string | null>(page.services.length === 1 ? page.services[0].id : null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ at: string; label: string } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const slots = useBookingSlots(page.slug, serviceId, day);
  const service = page.services.find((s) => s.id === serviceId) ?? null;
  const digits = phone.replace(/\D/g, '').length;
  const dataOk = name.trim().length >= 2 && digits >= 10 && digits <= 13;
  const step = !service ? 1 : !slot ? 2 : !dataOk ? 3 : 4;
  const Icon = AREA_ICON[page.practice_area ?? 'other'];

  if (page.services.length === 0 || page.weekdays.length === 0) {
    return (
      <View style={styles.card}>
        <SectionTitle page={page} />
        <View style={styles.emptyBox}>
          <CalendarX size={40} color={site.accent} />
          <Text style={styles.emptyTitle}>Sem horários no momento</Text>
          <Text style={styles.emptyText}>{page.name} ainda não abriu horários para agendar pelo site.</Text>
        </View>
      </View>
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
      onSuccess: onDone,
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

  const servicesPanel = (
    <Panel icon={Icon} title="Escolha o serviço" style={wide ? styles.col : undefined}>
      <View onLayout={(e) => onServicesLayout(e.nativeEvent.layout.y)} style={styles.list}>
        {page.services.map((s, i) => (
          <FadeIn key={s.id} delay={i * 60}>
            <ServiceOption
              service={s}
              selected={s.id === serviceId}
              onPress={() => {
                setServiceId(s.id);
                setSlot(null);
              }}
            />
          </FadeIn>
        ))}
      </View>
    </Panel>
  );

  const datePanel = (
    <Panel icon={CalendarDays} title="Escolha a data" style={wide ? styles.colWide : undefined}>
      <Calendar
        page={page}
        value={day}
        onChange={(d) => {
          setDay(d);
          setSlot(null);
        }}
      />
      <Text style={styles.subhead}>Escolha o horário</Text>
      {!service ? (
        <Text style={styles.hint}>Escolha o serviço primeiro.</Text>
      ) : !day ? (
        <Text style={styles.hint}>Toque num dia em destaque no calendário.</Text>
      ) : slots.isPending ? (
        <ActivityIndicator color={site.accent} />
      ) : slots.error ? (
        <Text style={styles.errorText}>{slots.error instanceof Error ? slots.error.message : 'Não foi possível carregar os horários.'}</Text>
      ) : slots.data && slots.data.slots.length > 0 ? (
        <SlotGrid slots={slots.data.slots} value={slot?.at ?? null} onChange={setSlot} />
      ) : (
        <Text style={styles.hint}>Nenhum horário livre neste dia. Escolha outro.</Text>
      )}
    </Panel>
  );

  const dataPanel = (
    <Panel icon={User} title="Seus dados" style={wide ? styles.col : undefined}>
      <DarkField label="Nome" value={name} onChangeText={setName} autoComplete="name" maxLength={120} placeholder="Como podemos te chamar?" />
      <DarkField
        label="WhatsApp com DDD"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={30}
        placeholder="(11) 99999-9999"
      />
      <DarkField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={1000} placeholder="Algo que devemos saber?" />
    </Panel>
  );

  const summaryPanel = (
    <Panel icon={CalendarCheck} title="Resumo do agendamento" style={wide ? styles.col : undefined}>
      <SummaryRow label="Serviço" value={service?.name ?? null} />
      <SummaryRow label="Data" value={day ? formatLongDate(day) : null} />
      <SummaryRow label="Horário" value={slot?.label ?? null} />
      <SummaryRow label="Duração" value={service ? formatDuration(service.duration_minutes) : null} />
      <SummaryRow label="Total" value={service ? formatCents(service.price_cents) : null} strong />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <PrimaryButton label="Confirmar agendamento" icon={CalendarCheck} onPress={submit} disabled={step < 4} loading={book.isPending} full />
      <View style={styles.safeNote}>
        <Lock size={13} color={site.faint} />
        <Text style={styles.safeText}>Seus dados vão só para {page.name}.</Text>
      </View>
    </Panel>
  );

  return (
    <View style={styles.card}>
      <SectionTitle page={page} />
      <Steps current={step} wide={medium} />
      {wide ? (
        <View style={styles.grid}>
          {servicesPanel}
          {datePanel}
          <View style={[styles.col, styles.stack]}>
            {dataPanel}
            {summaryPanel}
          </View>
        </View>
      ) : medium ? (
        <View style={styles.stack}>
          <View style={styles.row2}>
            <View style={styles.col}>{servicesPanel}</View>
            <View style={styles.col}>{datePanel}</View>
          </View>
          <View style={styles.row2}>
            <View style={styles.col}>{dataPanel}</View>
            <View style={styles.col}>{summaryPanel}</View>
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          {servicesPanel}
          {datePanel}
          {dataPanel}
          {summaryPanel}
        </View>
      )}
    </View>
  );
}

function SectionTitle({ page }: { page: BookingPage }) {
  const hours = page.hours ?? [];
  const first = hours[0];
  const sameEveryDay = hours.length > 0 && hours.every((h) => h.opens_at === first.opens_at && h.closes_at === first.closes_at);
  return (
    <View style={styles.sectionHead}>
      <View>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Agende seu horário
        </Text>
        <View style={styles.underline} />
      </View>
      {sameEveryDay ? (
        <View style={styles.hoursBadge}>
          <Clock size={22} color={site.accent} />
          <View>
            <Text style={styles.hoursKicker}>ATENDIMENTO</Text>
            <Text style={styles.hoursText}>
              {first.opens_at} às {first.closes_at}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Done({ page, result, onAgain }: { page: BookingPage; result: BookingResult; onAgain: () => void }) {
  const [scale] = useState(() => new Animated.Value(0));
  const [copied, setCopied] = useState(false);
  const link = result.manage_token ? bookingManageUrl(result.manage_token) : null;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: false, speed: 10, bounciness: 14 }).start();
  }, [scale]);
  return (
    <View style={[styles.card, styles.doneCard]}>
      <Animated.View style={[styles.doneIcon, { transform: [{ scale }] }]}>
        <CalendarCheck size={40} color="#FFFFFF" />
      </Animated.View>
      <FadeIn delay={150} style={styles.doneText}>
        <Text style={styles.doneTitle} accessibilityRole="header">
          Horário marcado!
        </Text>
        <Text style={styles.emptyText}>
          {result.service} em {page.name}, {result.label}. Valor: {formatCents(result.total_cents)}.
        </Text>
      </FadeIn>
      {link ? (
        <FadeIn delay={220} style={styles.linkBox}>
          <Text style={styles.linkTitle}>Guarde seu link</Text>
          <Text style={styles.linkText}>Por ele você remarca ou cancela até 2 horas antes, sem precisar ligar.</Text>
          <Text style={styles.linkUrl} selectable numberOfLines={2}>
            {link}
          </Text>
          <View style={styles.doneActions}>
            <GhostButton
              label={copied ? 'Link copiado' : 'Copiar link'}
              icon={copied ? Check : Copy}
              onPress={() => {
                Clipboard.setStringAsync(link)
                  .then(() => setCopied(true))
                  .catch(() => undefined);
              }}
            />
            <GhostButton label="Abrir meu horário" icon={CalendarClock} onPress={() => Linking.openURL(link)} />
          </View>
        </FadeIn>
      ) : (
        <Text style={styles.emptyText}>Se precisar mudar, é só avisar {page.name}.</Text>
      )}
      <FadeIn delay={300} style={styles.doneActions}>
        {page.whatsapp ? (
          <PrimaryButton
            label="Avisar pelo WhatsApp"
            icon={MessageCircle}
            onPress={() =>
              Linking.openURL(
                whatsappLink(page.whatsapp!, `Olá! Acabei de agendar ${result.service} para ${result.label} pela página de ${page.name}.`),
              )
            }
          />
        ) : null}
        <GhostButton label="Fazer outro agendamento" icon={RotateCcw} onPress={onAgain} />
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: site.bg },
  scroll: { flex: 1, backgroundColor: site.bg },
  scrollContent: { paddingBottom: 24 },
  container: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: site.bg },
  emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 24, maxWidth: 420, alignSelf: 'center' },
  emptyTitle: { fontFamily: f.display, fontSize: 26, color: site.text, textAlign: 'center' },
  emptyText: { fontFamily: f.medium, fontSize: 15, lineHeight: 22, color: site.muted, textAlign: 'center' },
  card: { backgroundColor: site.surface, borderRadius: 28, borderWidth: 1, borderColor: site.border, padding: 18, gap: 22 },
  sectionHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 8 },
  sectionTitle: { fontFamily: f.display, fontSize: 32, color: site.text },
  underline: { width: 44, height: 2, backgroundColor: site.accent, marginTop: 10, borderRadius: 1 },
  hoursBadge: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hoursKicker: { fontFamily: f.bold, fontSize: 11, letterSpacing: 1.4, color: site.muted },
  hoursText: { fontFamily: f.bold, fontSize: 15, color: site.text },
  grid: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  row2: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  colWide: { flex: 1.25, minWidth: 0 },
  stack: { gap: 16 },
  list: { gap: 10 },
  subhead: { fontFamily: f.bold, fontSize: 14, color: site.text, marginTop: 6 },
  hint: { fontFamily: f.medium, fontSize: 13, color: site.faint },
  errorText: { fontFamily: f.semibold, fontSize: 13, color: site.danger },
  safeNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  safeText: { fontFamily: f.medium, fontSize: 12, color: site.faint },
  featuresBox: { backgroundColor: site.surface, borderRadius: 24, borderWidth: 1, borderColor: site.border, padding: 22 },
  doneCard: { alignItems: 'center', paddingVertical: 48 },
  doneIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: site.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: site.accent,
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
  },
  doneText: { alignItems: 'center', gap: 8, maxWidth: 520 },
  doneTitle: { fontFamily: f.display, fontSize: 34, color: site.text, textAlign: 'center' },
  linkBox: {
    alignSelf: 'stretch',
    maxWidth: 560,
    width: '100%',
    marginHorizontal: 'auto',
    gap: 8,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: site.accentLine,
    backgroundColor: site.accentSoft,
    alignItems: 'center',
  },
  linkTitle: { fontFamily: f.bold, fontSize: 16, color: site.text },
  linkText: { fontFamily: f.medium, fontSize: 14, lineHeight: 20, color: site.muted, textAlign: 'center' },
  linkUrl: { fontFamily: f.semibold, fontSize: 13, color: site.accentText, textAlign: 'center' },
  doneActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
});
