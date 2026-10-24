import { router } from 'expo-router';
import { ChevronLeft, Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { NavRow } from '@/components/NavRow';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { getBusinessConfig } from '@/config/business';
import { useAuth } from '@/features/auth/AuthProvider';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';
import { useUpdateHourlyRate } from '@/features/organizations/api';
import { HourlyRateDialog } from '@/features/organizations/HourlyRateDialog';
import { formatCents } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { colors, fonts, minTouch } from '@/theme/tokens';

const ROLE_LABEL = { owner: 'Dono', admin: 'Administrador', member: 'Membro' } as const;

export default function SettingsScreen() {
  const { session } = useAuth();
  const { active, memberships, select } = useActiveOrganization();
  const org = active!.organization;
  const canEdit = active!.role === 'owner' || active!.role === 'admin';
  const updateRate = useUpdateHourlyRate(session?.user.id);
  const toast = useToast();
  const [rateOpen, setRateOpen] = useState(false);

  return (
    <Screen>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.circle}>
          <ChevronLeft size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.barTitle} accessibilityRole="header">
          Configurações
        </Text>
        <View style={styles.circlePlaceholder} />
      </View>

      <Card>
        <Text style={styles.cardTitle}>Empresa</Text>
        <Row label="Nome" value={org.name} />
        <Row label="Modelo de negócio" value={getBusinessConfig(org.business_type).label} />
        <Row label="Link de encomenda" value={`gestaofacil.app/e/${org.slug}`} />
        {org.business_type !== 'resale' ? (
          <Row
            label="Valor da hora"
            value={formatCents(org.hourly_rate_cents)}
            onPress={canEdit ? () => setRateOpen(true) : undefined}
          />
        ) : null}
        <Row label="Seu papel" value={ROLE_LABEL[active!.role]} />
      </Card>

      <Card style={styles.navCard}>
        <Text style={styles.cardTitle}>Cadastros</Text>
        <NavRow first label="Clientes" onPress={() => router.push('/clientes')} />
        <NavRow
          label={org.business_type === 'services' ? 'Serviços e materiais' : 'Itens'}
          onPress={() => router.push('/itens')}
        />
        <NavRow label="Fornecedores" onPress={() => router.push('/fornecedores')} />
        <NavRow label="Compras" onPress={() => router.push('/compras')} />
        <NavRow label="Orçamentos" onPress={() => router.push('/orcamentos')} />
        <NavRow label="Contas financeiras" onPress={() => router.push('/financeiro/contas')} />
        <NavRow label="Categorias financeiras" onPress={() => router.push('/financeiro/categorias')} />
      </Card>

      {memberships.length > 1 ? (
        <Card>
          <Text style={styles.cardTitle}>Trocar empresa</Text>
          {memberships.map((m) => (
            <Pressable
              key={m.organization.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: m.organization.id === org.id }}
              onPress={() => select(m.organization.id)}
              style={styles.row}
            >
              <Text style={[styles.rowValue, m.organization.id === org.id && styles.selected]}>{m.organization.name}</Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <HourlyRateDialog
        key={rateOpen ? 'open' : 'closed'}
        visible={rateOpen}
        currentCents={org.hourly_rate_cents}
        loading={updateRate.isPending}
        onClose={() => setRateOpen(false)}
        onSave={async (cents) => {
          await updateRate.mutateAsync({ organizationId: org.id, cents });
          setRateOpen(false);
          toast('Valor da hora atualizado');
        }}
      />

      <Card>
        <Text style={styles.cardTitle}>Conta</Text>
        <Row label="E-mail" value={session?.user.email ?? ''} />
        <Button label="Sair" variant="ink" onPress={() => supabase.auth.signOut()} />
      </Card>
    </Screen>
  );
}

function Row({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const content = (
    <>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
        {onPress ? <Pencil size={14} color={colors.gray500} /> : null}
      </View>
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${label.toLowerCase()}`} onPress={onPress} style={styles.row}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barTitle: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.ink },
  circle: {
    width: minTouch,
    height: minTouch,
    borderRadius: minTouch / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circlePlaceholder: { width: minTouch },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray500 },
  rowRight: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.ink, textAlign: 'right' },
  selected: { color: colors.primary },
  navCard: { gap: 4 },
});
