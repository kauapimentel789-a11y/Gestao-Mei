// Cartão de Configurações: plano e agendamento pelo site (Pro Max).
import { router } from 'expo-router';
import { Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { NavRow } from '@/components/NavRow';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { publicBookingUrl } from '@/lib/publicLink';
import { colors, fonts, radius } from '@/theme/tokens';

import { useBookingSettings, useBusinessHours, useSetOnlineBooking } from './api';
import { effectivePlan, hoursSummary, PLAN_LABEL } from './logic';

function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function BookingCard() {
  const { org, orgId, role } = useOrg();
  const settings = useBookingSettings(orgId);
  const hours = useBusinessHours(orgId);
  const setEnabled = useSetOnlineBooking(orgId);
  const toast = useToast();
  const canEdit = role !== 'member';

  // Só em serviços. Banco sem a migração 0016: o cartão não aparece.
  if (org.business_type !== 'services' || !settings.data) return null;
  const { plan, planUntil, enabled } = settings.data;
  const today = localToday();
  const current = effectivePlan(plan, planUntil, today);
  const expired = current !== plan;
  const link = publicBookingUrl(org.slug);

  return (
    <Card>
      <View style={styles.head}>
        <Text style={styles.cardTitle}>Agendamento pelo site</Text>
        <View style={[styles.badge, current === 'pro_max' && styles.badgeOn]}>
          <Text style={[styles.badgeText, current === 'pro_max' && styles.badgeTextOn]}>{PLAN_LABEL[current]}</Text>
        </View>
      </View>

      {current !== 'pro_max' ? (
        <Text style={styles.body}>
          {expired
            ? `Seu plano ${PLAN_LABEL[plan]} venceu em ${formatDate(planUntil!)}. Renove para a página de agendamento voltar a funcionar.`
            : 'Com o plano Pro Max, seus clientes escolhem o serviço e um horário livre numa página sua, sem instalar nada, e o horário cai direto na Agenda. Para ativar, fale com o suporte do Gestão Fácil.'}
        </Text>
      ) : (
        <>
          <Text style={styles.body}>
            {enabled
              ? 'Ligado. Quem abrir o link vê seus serviços com preço e os horários livres, e o horário marcado entra na Agenda como Recebido. O cliente não vê mais nada do sistema.'
              : 'Desligado. Ligue para seus clientes marcarem horário sozinhos por uma página.'}
            {planUntil ? ` Plano pago até ${formatDate(planUntil)}.` : ''}
          </Text>
          {hours.data && hours.data.length === 0 ? (
            <Text style={styles.warn}>Cadastre o horário de funcionamento para a página oferecer horários.</Text>
          ) : null}
          {link && enabled ? (
            <Text style={styles.link} selectable>
              {link}
            </Text>
          ) : null}
          {!link ? <Text style={styles.body}>Endereço da versão web não configurado (EXPO_PUBLIC_WEB_URL).</Text> : null}
          <View style={styles.actions}>
            {canEdit ? (
              <Button
                size="medium"
                variant={enabled ? 'tint' : 'primary'}
                label={enabled ? 'Desligar' : 'Ligar agendamento'}
                loading={setEnabled.isPending}
                onPress={() =>
                  setEnabled.mutate(!enabled, {
                    onSuccess: () => toast(enabled ? 'Agendamento desligado' : 'Agendamento ligado'),
                    onError: (e) => toast(friendlyError(e)),
                  })
                }
              />
            ) : null}
            {link && enabled ? (
              <Button size="medium" variant="tint" label="Compartilhar" onPress={() => Share.share({ message: `Agende seu horário em ${org.name}: ${link}` })} />
            ) : null}
          </View>
          <NavRow label={`Horário de funcionamento${hours.data ? ` · ${hoursSummary(hours.data)}` : ''}`} onPress={() => router.push('/funcionamento')} />
          <NavRow label="Página do cliente · frase, WhatsApp, endereço e Instagram" onPress={() => router.push('/pagina-cliente')} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.gray100 },
  badgeOn: { backgroundColor: colors.primaryTint },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray600 },
  badgeTextOn: { color: colors.primaryText },
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
  warn: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText, lineHeight: 19 },
  link: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryText },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
