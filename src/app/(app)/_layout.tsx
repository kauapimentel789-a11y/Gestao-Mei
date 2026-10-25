import { Stack } from 'expo-router';

import { LateOrderAlerts } from '@/features/alerts/LateOrderAlerts';
import { DasReminder } from '@/features/das/DasReminder';
import { colors } from '@/theme/tokens';

export default function AppLayout() {
  return (
    <>
      <LateOrderAlerts />
      <DasReminder />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </>
  );
}
