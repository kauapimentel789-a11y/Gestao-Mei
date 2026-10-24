import { Stack } from 'expo-router';

import { LateOrderAlerts } from '@/features/alerts/LateOrderAlerts';
import { colors } from '@/theme/tokens';

export default function AppLayout() {
  return (
    <>
      <LateOrderAlerts />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </>
  );
}
