// Chave do topo do Início: "Minha empresa" ou "Minhas finanças". O espaço
// pessoal é aberto no primeiro toque; sem empresa, leva ao cadastro dela.
import { router } from 'expo-router';
import { Briefcase, type LucideIcon, Wallet } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useToast } from '@/components/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { friendlyError } from '@/lib/errors';
import { colors, fonts, radius } from '@/theme/tokens';

import { useActiveOrganization } from './ActiveOrganizationProvider';
import { useCreatePersonalSpace } from './api';

export function SpaceSwitcher() {
  const { session } = useAuth();
  const { active, personal, lastBusiness, select } = useActiveOrganization();
  const create = useCreatePersonalSpace(session?.user.id);
  const toast = useToast();
  const onPersonal = active?.organization.kind === 'personal';

  const toBusiness = () => {
    if (!onPersonal) return;
    if (lastBusiness) select(lastBusiness.organization.id);
    else router.push('/nova-empresa');
  };

  const toPersonal = async () => {
    if (onPersonal || create.isPending) return;
    if (personal) return select(personal.organization.id);
    try {
      const space = await create.mutateAsync();
      select(space.id);
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel="Escolher o que ver">
      <Option label="Minha empresa" icon={Briefcase} selected={!onPersonal} onPress={toBusiness} />
      <Option label="Minhas finanças" icon={Wallet} selected={onPersonal} loading={create.isPending} onPress={toPersonal} />
    </View>
  );
}

function Option({
  label,
  icon: Icon,
  selected,
  loading,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  selected: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const color = selected ? colors.white : colors.gray600;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected, busy: loading }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.selected, pressed && !selected && styles.pressed]}
    >
      {loading ? <ActivityIndicator size="small" color={color} /> : <Icon size={16} color={color} strokeWidth={2.2} />}
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 4, backgroundColor: colors.gray150, borderRadius: radius.segmented, padding: 4 },
  option: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.segmentedOption,
    paddingHorizontal: 10,
  },
  selected: { backgroundColor: colors.ink },
  pressed: { backgroundColor: colors.gray200 },
  label: { fontFamily: fonts.bold, fontSize: 13 },
});
