import { ClipboardList } from 'lucide-react-native';

import { ModulePending } from '@/components/ModulePending';
import { useOrg } from '@/features/organizations/useOrg';
import { ProductionTab } from '@/features/production/ProductionTab';

export default function Screen() {
  const { org, config } = useOrg();
  if (org.business_type === 'production') return <ProductionTab />;
  return <ModulePending title={config.tabLabels.tarefas} icon={ClipboardList} description="Tarefas chegam numa próxima etapa." />;
}
