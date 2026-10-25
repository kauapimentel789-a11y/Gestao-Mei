// Peças da página de agendamento do cliente (/agendar/<slug>).
import {
  AtSign,
  BadgeCheck,
  Briefcase,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  type LucideIcon,
  MapPin,
  MessageCircle,
  Scissors,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Zap,
} from 'lucide-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Linking, Platform, Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { FadeIn, useLoop, usePressScale } from '@/components/motion';
import { formatCents } from '@/lib/money';

import type { BookingPage, BookingService } from '../../../../supabase/functions/_shared/public-order';
import { addMonth, formatDuration, formatPhone, MONTH_LABEL, monthGrid, weekSchedule, whatsappLink } from '../logic';
import { site, siteFonts as f } from './theme';

export const AREA_ICON: Record<string, LucideIcon> = {
  beauty: Scissors,
  health: Stethoscope,
  professional: Briefcase,
  other: Sparkles,
};

const AREA_KICKER: Record<string, string> = {
  beauty: 'BELEZA · CUIDADO · ESTILO',
  health: 'SAÚDE · CUIDADO · CONFIANÇA',
  professional: 'ATENDIMENTO · CONFIANÇA · AGILIDADE',
  other: 'ATENDIMENTO COM HORA MARCADA',
};

export function mapsLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// ---------------------------------------------------------------------------
// Botões
// ---------------------------------------------------------------------------

export function PrimaryButton({
  label,
  onPress,
  icon: Icon,
  disabled,
  loading,
  full,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
}) {
  const press = usePressScale();
  const inactive = disabled || loading;
  return (
    <Animated.View style={[press.style, full && styles.full]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.primary,
          (pressed || hovered) && !inactive && styles.primaryHover,
          inactive && styles.inactive,
        ]}
      >
        <Text style={styles.primaryLabel}>{loading ? 'Enviando…' : label}</Text>
        {Icon ? <Icon size={18} color="#FFFFFF" /> : null}
      </Pressable>
    </Animated.View>
  );
}

export function GhostButton({ label, onPress, icon: Icon }: { label: string; onPress: () => void; icon?: LucideIcon }) {
  const press = usePressScale();
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.ghost, hovered && styles.ghostHover]}
      >
        {Icon ? <Icon size={18} color={site.text} /> : null}
        <Text style={styles.ghostLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Topo
// ---------------------------------------------------------------------------

export function Header({ page, wide, onNav }: { page: BookingPage; wide: boolean; onNav: (to: 'servicos' | 'agendar' | 'contato') => void }) {
  const Icon = AREA_ICON[page.practice_area ?? 'other'] ?? Sparkles;
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Icon size={20} color={site.accent} />
        </View>
        <Text style={styles.brandName} numberOfLines={1}>
          {page.name}
        </Text>
      </View>
      {wide ? (
        <View style={styles.nav}>
          {(
            [
              ['servicos', 'Serviços'],
              ['agendar', 'Agendar'],
              ['contato', 'Contato'],
            ] as const
          ).map(([to, label]) => (
            <Pressable key={to} accessibilityRole="link" onPress={() => onNav(to)}>
              {({ hovered }: { pressed: boolean; hovered?: boolean }) => <Text style={[styles.navItem, hovered && styles.navHover]}>{label}</Text>}
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => onNav('agendar')}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.headerCta, hovered && styles.headerCtaHover]}
      >
        <Text style={styles.headerCtaText}>Agendar</Text>
        <CalendarCheck size={16} color={site.accentText} />
      </Pressable>
    </View>
  );
}

/** Fundo do topo: dois brilhos laranja que respiram devagar. */
function Glow() {
  const loop = useLoop(3200);
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: loop.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="g1" cx="85%" cy="15%" r="55%">
            <Stop offset="0" stopColor={site.accent} stopOpacity="0.45" />
            <Stop offset="1" stopColor={site.accent} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="g2" cx="5%" cy="100%" r="45%">
            <Stop offset="0" stopColor={site.accent} stopOpacity="0.18" />
            <Stop offset="1" stopColor={site.accent} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#g1)" />
        <Rect width="100%" height="100%" fill="url(#g2)" />
      </Svg>
    </Animated.View>
  );
}

function OpenNow({ page }: { page: BookingPage }) {
  const loop = useLoop(1100);
  const [y, m, d] = page.today.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const today = (page.hours ?? []).filter((h) => h.weekday === weekday);
  const open = today.length > 0;
  return (
    <View style={styles.status}>
      <Animated.View style={[styles.dot, { backgroundColor: open ? site.success : site.faint, opacity: open ? loop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) : 1 }]} />
      <Text style={styles.statusText}>
        {open ? `Hoje: ${today.map((h) => `${h.opens_at} às ${h.closes_at}`).join(' e ')}` : 'Fechado hoje · agende para outro dia'}
      </Text>
    </View>
  );
}

export function Hero({ page, wide, onBook }: { page: BookingPage; wide: boolean; onBook: () => void }) {
  const title = page.tagline ?? page.name;
  // A última palavra do título ganha a cor de destaque, como nos modelos.
  const words = title.split(' ');
  const head = words.length > 1 ? words.slice(0, -1).join(' ') : '';
  const tail = words[words.length - 1];
  return (
    <View style={[styles.hero, wide && styles.heroWide]}>
      <Glow />
      <FadeIn delay={80}>
        <Text style={styles.kicker}>{AREA_KICKER[page.practice_area ?? 'other'] ?? AREA_KICKER.other}</Text>
      </FadeIn>
      <FadeIn delay={180}>
        <Text style={[styles.heroTitle, wide && styles.heroTitleWide]} accessibilityRole="header">
          {head ? `${head} ` : ''}
          <Text style={styles.heroAccent}>{tail}</Text>
        </Text>
      </FadeIn>
      <FadeIn delay={280}>
        <Text style={styles.heroSub}>{page.about ?? `Escolha o serviço e um horário livre em ${page.name}. Leva menos de um minuto e o horário fica reservado na hora.`}</Text>
      </FadeIn>
      <FadeIn delay={380} style={styles.heroActions}>
        <PrimaryButton label="Agendar agora" icon={CalendarCheck} onPress={onBook} />
        {page.whatsapp ? (
          <GhostButton
            label="Falar no WhatsApp"
            icon={MessageCircle}
            onPress={() => Linking.openURL(whatsappLink(page.whatsapp!, `Olá! Vim pela página de agendamento de ${page.name}.`))}
          />
        ) : null}
      </FadeIn>
      <FadeIn delay={480}>
        <OpenNow page={page} />
      </FadeIn>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Atalhos (modelo de app escuro com cartões)
// ---------------------------------------------------------------------------

export function QuickTiles({ page, onNav }: { page: BookingPage; onNav: (to: 'servicos' | 'agendar' | 'contato') => void }) {
  const tiles: { icon: LucideIcon; label: string; onPress: () => void }[] = [
    { icon: AREA_ICON[page.practice_area ?? 'other'] ?? Sparkles, label: 'Serviços', onPress: () => onNav('servicos') },
    { icon: CalendarCheck, label: 'Agenda', onPress: () => onNav('agendar') },
  ];
  if (page.whatsapp) tiles.push({ icon: MessageCircle, label: 'WhatsApp', onPress: () => Linking.openURL(whatsappLink(page.whatsapp!)) });
  if (page.address) tiles.push({ icon: MapPin, label: 'Como chegar', onPress: () => Linking.openURL(mapsLink(page.address!)) });
  else if (page.instagram) tiles.push({ icon: AtSign, label: 'Instagram', onPress: () => Linking.openURL(`https://instagram.com/${page.instagram}`) });
  return (
    <View style={styles.tiles}>
      {tiles.map((t, i) => (
        <FadeIn key={t.label} delay={520 + i * 70} style={styles.tileWrap}>
          <Tile {...t} />
        </FadeIn>
      ))}
    </View>
  );
}

function Tile({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const press = usePressScale(0.94);
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.tile, hovered && styles.tileHover]}
      >
        <Icon size={24} color={site.accent} />
        <Text style={styles.tileLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Agendamento
// ---------------------------------------------------------------------------

const STEPS = [
  ['Serviço', 'Escolha o serviço'],
  ['Data e hora', 'Dia e horário livre'],
  ['Seus dados', 'Nome e WhatsApp'],
  ['Confirmar', 'Revise e confirme'],
] as const;

export function Steps({ current, wide }: { current: number; wide: boolean }) {
  return (
    <View style={styles.steps}>
      {STEPS.map(([title, sub], i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <View key={title} style={[styles.step, wide && styles.stepWide]}>
            <View style={[styles.stepCircle, (done || active) && styles.stepCircleOn]}>
              <Text style={[styles.stepNumber, (done || active) && styles.stepNumberOn]}>{done ? '✓' : n}</Text>
            </View>
            {wide || active ? (
              <View>
                <Text style={[styles.stepTitle, active && styles.stepTitleOn]}>{title}</Text>
                {wide ? <Text style={styles.stepSub}>{sub}</Text> : null}
              </View>
            ) : null}
            {wide && i < STEPS.length - 1 ? <View style={[styles.stepLine, done && styles.stepLineOn]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

export function Panel({ icon: Icon, title, children, style }: { icon: LucideIcon; title: string; children: ReactNode; style?: object }) {
  return (
    <View style={[styles.panel, style]}>
      <View style={styles.panelHead}>
        <Icon size={18} color={site.accent} />
        <Text style={styles.panelTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export function ServiceOption({ service, selected, onPress }: { service: BookingService; selected: boolean; onPress: () => void }) {
  const press = usePressScale(0.98);
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.option, hovered && styles.optionHover, selected && styles.optionOn]}
      >
        <View style={styles.flex}>
          <Text style={styles.optionTitle}>{service.name}</Text>
          {service.description ? (
            <Text style={styles.optionDesc} numberOfLines={2}>
              {service.description}
            </Text>
          ) : null}
          <Text style={styles.optionMeta}>
            <Text style={styles.optionPrice}>{formatCents(service.price_cents)}</Text> · {formatDuration(service.duration_minutes)}
          </Text>
        </View>
        <Check on={selected} />
      </Pressable>
    </Animated.View>
  );
}

/** Bolinha de seleção que "salta" ao marcar. */
function Check({ on }: { on: boolean }) {
  const [scale] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    Animated.spring(scale, { toValue: on ? 1 : 0, useNativeDriver: false, speed: 18, bounciness: 12 }).start();
  }, [on, scale]);
  return (
    <View style={[styles.checkRing, on && styles.checkRingOn]}>
      <Animated.View style={[styles.checkFill, { transform: [{ scale }] }]}>
        <Text style={styles.checkMark}>✓</Text>
      </Animated.View>
    </View>
  );
}

const WEEK_HEAD = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

export function Calendar({
  page,
  value,
  onChange,
}: {
  page: BookingPage;
  value: string | null;
  onChange: (date: string) => void;
}) {
  const [y, m] = page.today.split('-').map(Number) as [number, number];
  const [view, setView] = useState({ year: y, month: m });
  const [ly, lm] = page.last_day.split('-').map(Number) as [number, number];
  const canPrev = view.year * 12 + view.month > y * 12 + m;
  const canNext = view.year * 12 + view.month < ly * 12 + lm;
  const weeks = monthGrid(view.year, view.month, page.today, page.last_day, page.weekdays);
  return (
    <View style={styles.calendar}>
      <View style={styles.calHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mês anterior"
          disabled={!canPrev}
          onPress={() => setView(addMonth(view.year, view.month, -1))}
          style={[styles.calNav, !canPrev && styles.inactive]}
        >
          <ChevronLeft size={18} color={site.text} />
        </Pressable>
        <Text style={styles.calTitle}>
          {MONTH_LABEL[view.month - 1]} {view.year}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo mês"
          disabled={!canNext}
          onPress={() => setView(addMonth(view.year, view.month, 1))}
          style={[styles.calNav, !canNext && styles.inactive]}
        >
          <ChevronRight size={18} color={site.text} />
        </Pressable>
      </View>
      <View style={styles.calRow}>
        {WEEK_HEAD.map((w) => (
          <Text key={w} style={styles.calWeek}>
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week, i) => (
        <View key={i} style={styles.calRow}>
          {week.map((day, j) =>
            day ? (
              <Pressable
                key={day.date}
                accessibilityRole="button"
                accessibilityLabel={`Dia ${day.day}`}
                accessibilityState={{ disabled: !day.available, selected: day.date === value }}
                disabled={!day.available}
                onPress={() => onChange(day.date)}
                style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.calCell,
                  day.available && hovered && styles.calCellHover,
                  day.date === value && styles.calCellOn,
                ]}
              >
                <Text style={[styles.calDay, !day.available && styles.calDayOff, day.date === value && styles.calDayOn]}>{day.day}</Text>
                {day.date === page.today ? <View style={styles.todayDot} /> : null}
              </Pressable>
            ) : (
              <View key={`e${j}`} style={styles.calCell} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

export function SlotGrid({
  slots,
  value,
  onChange,
}: {
  slots: { at: string; label: string }[];
  value: string | null;
  onChange: (slot: { at: string; label: string }) => void;
}) {
  return (
    <View style={styles.slots}>
      {slots.map((s, i) => (
        <FadeIn key={s.at} delay={i * 25} distance={6} duration={260}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: s.at === value }}
            onPress={() => onChange(s)}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.slot, hovered && styles.slotHover, s.at === value && styles.slotOn]}
          >
            <Text style={[styles.slotText, s.at === value && styles.slotTextOn]}>{s.label}</Text>
          </Pressable>
        </FadeIn>
      ))}
    </View>
  );
}

export function DarkField({ label, error, ...rest }: TextInputProps & { label: string; error?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={site.faint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.inputFocus, error ? styles.inputError : null, rest.multiline && styles.inputMulti]}
        {...rest}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function SummaryRow({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, !value && styles.summaryEmpty, strong && styles.summaryStrong]}>{value ?? '—'}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Vantagens e rodapé
// ---------------------------------------------------------------------------

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Zap, title: 'Agendamento rápido', text: 'Escolha serviço, dia e horário em poucos toques.' },
  { icon: ShieldCheck, title: 'Horário garantido', text: 'O horário fica reservado assim que você confirma.' },
  { icon: Clock, title: 'Só horários livres', text: 'A agenda mostra apenas o que está disponível de verdade.' },
  { icon: BadgeCheck, title: 'Sem cadastro', text: 'Basta seu nome e WhatsApp. Nada de senha.' },
];

export function Features({ wide }: { wide: boolean }) {
  return (
    <View style={[styles.features, wide && styles.featuresWide]}>
      {FEATURES.map((it, i) => (
        <FadeIn key={it.title} delay={i * 90} style={[styles.feature, wide && styles.featureWide]}>
          <View style={styles.featureIcon}>
            <it.icon size={22} color={site.accent} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.featureTitle}>{it.title}</Text>
            <Text style={styles.featureText}>{it.text}</Text>
          </View>
        </FadeIn>
      ))}
    </View>
  );
}

export function Footer({ page, wide }: { page: BookingPage; wide: boolean }) {
  const Icon = AREA_ICON[page.practice_area ?? 'other'] ?? Sparkles;
  const week = weekSchedule(page.hours ?? []);
  const year = page.today.slice(0, 4);
  return (
    <View style={styles.footer}>
      <View style={[styles.footerCols, wide && styles.footerColsWide]}>
        <View style={[styles.footerCol, wide && styles.footerColWide, wide && styles.footerBrand]}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Icon size={20} color={site.accent} />
            </View>
            <Text style={styles.brandName}>{page.name}</Text>
          </View>
          {page.about ? <Text style={styles.footerText}>{page.about}</Text> : null}
          <View style={styles.socials}>
            {page.instagram ? (
              <Social icon={AtSign} label="Instagram" onPress={() => Linking.openURL(`https://instagram.com/${page.instagram}`)} />
            ) : null}
            {page.whatsapp ? <Social icon={MessageCircle} label="WhatsApp" onPress={() => Linking.openURL(whatsappLink(page.whatsapp!))} /> : null}
          </View>
        </View>

        <View style={[styles.footerCol, wide && styles.footerColWide]}>
          <Text style={styles.footerTitle}>SERVIÇOS</Text>
          {page.services.slice(0, 6).map((s) => (
            <Text key={s.id} style={styles.footerText}>
              {s.name}
            </Text>
          ))}
        </View>

        {page.whatsapp || page.address || page.instagram ? (
          <View style={[styles.footerCol, wide && styles.footerColWide]}>
            <Text style={styles.footerTitle}>CONTATO</Text>
            {page.whatsapp ? <ContactLine icon={MessageCircle} text={`WhatsApp ${formatPhone(page.whatsapp)}`} url={whatsappLink(page.whatsapp)} /> : null}
            {page.instagram ? <ContactLine icon={AtSign} text={`@${page.instagram}`} url={`https://instagram.com/${page.instagram}`} /> : null}
            {page.address ? <ContactLine icon={MapPin} text={page.address} url={mapsLink(page.address)} /> : null}
          </View>
        ) : null}

        <View style={[styles.footerCol, wide && styles.footerColWide]}>
          <Text style={styles.footerTitle}>HORÁRIO DE FUNCIONAMENTO</Text>
          {week.map((d) => (
            <View key={d.day} style={styles.hourRow}>
              <Text style={styles.hourDay}>{d.day}</Text>
              <Text style={[styles.hourText, d.text === 'Fechado' && styles.hourClosed]}>{d.text}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.footerBottom}>
        <Text style={styles.copy}>
          © {year} {page.name}. Todos os direitos reservados.
        </Text>
        <Text style={styles.copy}>Agendamento por Gestão Fácil</Text>
      </View>
    </View>
  );
}

function Social({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.social, hovered && styles.socialHover]}
    >
      <Icon size={18} color={site.text} />
    </Pressable>
  );
}

function ContactLine({ icon: Icon, text, url }: { icon: LucideIcon; text: string; url: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)} style={styles.contact}>
      {({ hovered }: { pressed: boolean; hovered?: boolean }) => (
        <>
          <Icon size={16} color={site.accent} />
          <Text style={[styles.footerText, styles.flex, hovered && styles.contactHover]}>{text}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  full: { alignSelf: 'stretch' },
  inactive: { opacity: 0.4 },

  primary: {
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: site.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: site.accent,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryHover: { backgroundColor: site.accentPressed },
  primaryLabel: { fontFamily: f.extrabold, fontSize: 15, color: '#FFFFFF', letterSpacing: 0.3 },
  ghost: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: site.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.03)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ghostHover: { backgroundColor: 'rgba(255,255,255,0.08)' },
  ghostLabel: { fontFamily: f.bold, fontSize: 15, color: site.text },

  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
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
  brandName: { fontFamily: f.display, fontSize: 20, color: site.text, letterSpacing: 0.3, flexShrink: 1 },
  nav: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 32 },
  navItem: { fontFamily: f.semibold, fontSize: 13, letterSpacing: 1.2, color: site.muted, textTransform: 'uppercase' },
  navHover: { color: site.text },
  headerCta: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: site.accentLine,
  },
  headerCtaHover: { backgroundColor: site.accentSoft },
  headerCtaText: { fontFamily: f.bold, fontSize: 13, letterSpacing: 1, color: site.accentText, textTransform: 'uppercase' },

  hero: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: site.surface,
    borderWidth: 1,
    borderColor: site.border,
    paddingHorizontal: 22,
    paddingVertical: 32,
    gap: 16,
  },
  heroWide: { paddingHorizontal: 56, paddingVertical: 64 },
  kicker: { fontFamily: f.bold, fontSize: 12, letterSpacing: 2.4, color: site.accentText },
  heroTitle: { fontFamily: f.display, fontSize: 40, lineHeight: 46, color: site.text, maxWidth: 680 },
  heroTitleWide: { fontSize: 64, lineHeight: 70 },
  heroAccent: { color: site.accent, fontStyle: 'italic' },
  heroSub: { fontFamily: f.medium, fontSize: 16, lineHeight: 24, color: site.muted, maxWidth: 520 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  status: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: site.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: f.semibold, fontSize: 13, color: site.text },

  tiles: { flexDirection: 'row', gap: 10 },
  tileWrap: { flex: 1 },
  tile: {
    minHeight: 88,
    borderRadius: 18,
    backgroundColor: site.surface,
    borderWidth: 1,
    borderColor: site.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  tileHover: { borderColor: site.accentLine, backgroundColor: site.surface2 },
  tileLabel: { fontFamily: f.semibold, fontSize: 12, color: site.text, textAlign: 'center' },

  steps: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepWide: { flex: 1 },
  stepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: site.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleOn: { backgroundColor: site.accent, borderColor: site.accent },
  stepNumber: { fontFamily: f.bold, fontSize: 14, color: site.muted },
  stepNumberOn: { color: '#FFFFFF' },
  stepTitle: { fontFamily: f.bold, fontSize: 14, color: site.muted },
  stepTitleOn: { color: site.text },
  stepSub: { fontFamily: f.medium, fontSize: 12, color: site.faint },
  stepLine: { flex: 1, height: 1, backgroundColor: site.border, marginHorizontal: 6 },
  stepLineOn: { backgroundColor: site.accentLine },

  panel: { backgroundColor: site.surface2, borderRadius: 20, borderWidth: 1, borderColor: site.border, padding: 18, gap: 12 },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  panelTitle: { fontFamily: f.bold, fontSize: 15, color: site.text },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: site.border,
    backgroundColor: site.surface,
  },
  optionHover: { borderColor: site.borderStrong },
  optionOn: { borderColor: site.accent, backgroundColor: site.accentSoft },
  optionTitle: { fontFamily: f.bold, fontSize: 15, color: site.text },
  optionDesc: { fontFamily: f.medium, fontSize: 12, color: site.muted, marginTop: 2 },
  optionMeta: { fontFamily: f.medium, fontSize: 13, color: site.muted, marginTop: 4 },
  optionPrice: { fontFamily: f.extrabold, color: site.accentText },
  checkRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: site.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkRingOn: { borderColor: site.accent },
  checkFill: { width: 22, height: 22, borderRadius: 11, backgroundColor: site.accent, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#FFFFFF', fontSize: 12, fontFamily: f.extrabold },

  calendar: { backgroundColor: site.surface, borderRadius: 16, borderWidth: 1, borderColor: site.border, padding: 10, gap: 4 },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  calNav: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  calTitle: { fontFamily: f.bold, fontSize: 15, color: site.text },
  calRow: { flexDirection: 'row' },
  calWeek: { flex: 1, textAlign: 'center', fontFamily: f.semibold, fontSize: 10, letterSpacing: 0.6, color: site.faint, paddingVertical: 4 },
  calCell: { flex: 1, aspectRatio: 1, maxHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  calCellHover: { backgroundColor: 'rgba(255,255,255,0.06)' },
  calCellOn: { backgroundColor: site.accent },
  calDay: { fontFamily: f.semibold, fontSize: 14, color: site.text },
  calDayOff: { color: '#3F3F46' },
  calDayOn: { color: '#FFFFFF', fontFamily: f.extrabold },
  todayDot: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: site.accent },

  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    minWidth: 78,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: site.border,
    backgroundColor: site.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotHover: { borderColor: site.borderStrong },
  slotOn: { backgroundColor: site.accent, borderColor: site.accent },
  slotText: { fontFamily: f.bold, fontSize: 14, color: site.text },
  slotTextOn: { color: '#FFFFFF' },

  field: { gap: 6 },
  fieldLabel: { fontFamily: f.semibold, fontSize: 12, color: site.muted },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: site.border,
    backgroundColor: site.surface,
    paddingHorizontal: 14,
    fontFamily: f.medium,
    // 16 ou mais: o Safari do iPhone não amplia a tela ao tocar no campo.
    fontSize: 16,
    color: site.text,
    // Sem o contorno branco do navegador; o foco aparece na borda laranja.
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  inputMulti: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  inputFocus: { borderColor: site.accent },
  inputError: { borderColor: site.danger },
  fieldError: { fontFamily: f.semibold, fontSize: 12, color: site.danger },

  summaryRow: { gap: 2, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: site.border },
  summaryLabel: { fontFamily: f.medium, fontSize: 12, color: site.faint },
  summaryValue: { fontFamily: f.semibold, fontSize: 14, color: site.text },
  summaryEmpty: { color: '#52525B' },
  summaryStrong: { fontFamily: f.extrabold, fontSize: 22, color: site.accentText },

  features: { gap: 16 },
  featuresWide: { flexDirection: 'row' },
  feature: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  featureWide: { flex: 1 },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: site.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { fontFamily: f.bold, fontSize: 15, color: site.text },
  featureText: { fontFamily: f.medium, fontSize: 13, lineHeight: 19, color: site.muted, marginTop: 2 },

  footer: { borderTopWidth: 1, borderTopColor: site.border, paddingTop: 32, gap: 28 },
  footerCols: { gap: 28 },
  footerColsWide: { flexDirection: 'row' },
  // flex só lado a lado: empilhado, flex: 1 encolhe a coluna e uma cobre a outra.
  footerCol: { gap: 10, minWidth: 0 },
  footerColWide: { flex: 1 },
  footerBrand: { flex: 1.4, paddingRight: 24 },
  footerTitle: { fontFamily: f.bold, fontSize: 12, letterSpacing: 1.4, color: site.text, marginBottom: 2 },
  footerText: { fontFamily: f.medium, fontSize: 13, lineHeight: 20, color: site.muted },
  socials: { flexDirection: 'row', gap: 10, marginTop: 4 },
  social: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: site.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialHover: { borderColor: site.accentLine, backgroundColor: site.accentSoft },
  contact: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', minHeight: 28 },
  contactHover: { color: site.text },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  hourDay: { fontFamily: f.semibold, fontSize: 13, color: site.text },
  hourText: { fontFamily: f.medium, fontSize: 13, color: site.muted, textAlign: 'right', flexShrink: 1 },
  hourClosed: { color: site.faint },
  footerBottom: {
    borderTopWidth: 1,
    borderTopColor: site.border,
    paddingVertical: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  copy: { fontFamily: f.medium, fontSize: 12, color: site.faint },
});
