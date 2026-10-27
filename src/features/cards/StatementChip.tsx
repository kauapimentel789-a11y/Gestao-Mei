import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/theme/tokens';

import { STATEMENT_STATUS_LABEL, type StatementStatus } from './logic';

const CHIP: Record<StatementStatus, { bg: string; fg: string }> = {
  open: { bg: colors.gray100, fg: colors.gray700 },
  closed: { bg: colors.primaryTint, fg: colors.primaryText },
  partial: { bg: colors.primaryTint, fg: colors.primaryText },
  overdue: { bg: colors.primary, fg: colors.white },
  paid: { bg: colors.graphite, fg: colors.white },
};

export function StatementChip({ status }: { status: StatementStatus }) {
  const s = CHIP[status];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.fg }]}>{STATEMENT_STATUS_LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontFamily: fonts.bold, fontSize: 11 },
});
