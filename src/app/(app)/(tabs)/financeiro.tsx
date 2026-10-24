import { Wallet } from 'lucide-react-native';

import { ModulePending } from '@/components/ModulePending';
import { getBusinessConfig } from '@/config/business';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';

export default function Screen() {
  const { active } = useActiveOrganization();
  const config = getBusinessConfig(active!.organization.business_type);
  return <ModulePending title={config.tabLabels.financeiro} icon={Wallet} description="Contas, recebimentos, despesas e fluxo de caixa chegam numa próxima etapa." />;
}
