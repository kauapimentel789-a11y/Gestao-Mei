import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';

import { CircleButton, DetailBar } from '@/components/DetailBar';
import { Screen } from '@/components/Screen';
import { ItemsList } from '@/features/products/ItemsList';
import { colors } from '@/theme/tokens';

export default function ItemsScreen() {
  return (
    <Screen>
      <DetailBar
        title="Serviços e materiais"
        right={<CircleButton label="Novo item" icon={<Plus size={20} color={colors.ink} />} onPress={() => router.push('/itens/form')} />}
      />
      <ItemsList />
    </Screen>
  );
}
