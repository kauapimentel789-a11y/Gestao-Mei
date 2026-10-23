import { Package } from 'lucide-react-native';

import { ModulePending } from '@/components/ModulePending';
import { getBusinessConfig } from '@/config/business';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';

export default function Screen() {
  const { active } = useActiveOrganization();
  const config = getBusinessConfig(active!.organization.business_type);
  return <ModulePending title={config.tabLabels.estoque} icon={Package} description="Itens, movimentações e alertas de reposição chegam em breve." />;
}
