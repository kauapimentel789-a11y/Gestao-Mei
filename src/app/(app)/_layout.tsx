import { Redirect, Stack, usePathname } from 'expo-router';

import { LateOrderAlerts } from '@/features/alerts/LateOrderAlerts';
import { DasReminder } from '@/features/das/DasReminder';
import { QuickNoticeProvider } from '@/features/orders/QuickAdvance';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';
import { personalAllows } from '@/features/personal/logic';
import { colors } from '@/theme/tokens';

export default function AppLayout() {
  const { active } = useActiveOrganization();
  const pathname = usePathname();
  // Avisos de pedidos atrasados e do DAS são da empresa; no pessoal não rodam,
  // e telas da empresa abertas pelo endereço voltam para o Início.
  const business = active?.organization.kind === 'business';
  if (!business && !personalAllows(pathname)) return <Redirect href="/" />;
  return (
    <QuickNoticeProvider>
      {business ? <LateOrderAlerts /> : null}
      {business ? <DasReminder /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </QuickNoticeProvider>
  );
}
