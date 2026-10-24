import { useState } from 'react';

import { SegmentedControl } from '@/components/SegmentedControl';
import { useOrg } from '@/features/organizations/useOrg';
import { ProductionTab } from '@/features/production/ProductionTab';
import { TasksTab } from '@/features/tasks/TasksTab';

type View = 'production' | 'tasks';

export default function Screen() {
  const { org, config } = useOrg();
  const [view, setView] = useState<View>('production');
  if (org.business_type !== 'production') return <TasksTab title={config.tabLabels.tarefas} />;

  // Negócios de produção: a aba junta produção e tarefas.
  const header = (
    <SegmentedControl
      accessibilityLabel="Produção ou tarefas"
      value={view}
      onChange={setView}
      segments={[
        { value: 'production', label: 'Produção' },
        { value: 'tasks', label: 'Tarefas' },
      ]}
    />
  );
  return view === 'production' ? <ProductionTab header={header} /> : <TasksTab title={config.tabLabels.tarefas} header={header} />;
}
