import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';

import { CircleButton, DetailBar } from '@/components/DetailBar';
import { Screen } from '@/components/Screen';
import { SupplierList } from '@/features/suppliers/SupplierList';
import { colors } from '@/theme/tokens';

export default function SuppliersScreen() {
  return (
    <Screen>
      <DetailBar
        title="Fornecedores"
        right={<CircleButton label="Novo fornecedor" icon={<Plus size={20} color={colors.ink} />} onPress={() => router.push('/fornecedores/form')} />}
      />
      <SupplierList />
    </Screen>
  );
}
