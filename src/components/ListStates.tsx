// Carregando / erro / vazio para listas, para cada tela não repetir o mesmo if.
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { friendlyError } from '@/lib/errors';
import { colors } from '@/theme/tokens';

import { EmptyState } from './EmptyState';
import { ErrorCard } from './ErrorCard';

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View style={styles.wrap} accessibilityLabel="Carregando">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row} />
      ))}
    </View>
  );
}

interface QueryLike {
  isPending: boolean;
  error: unknown;
  refetch: () => unknown;
}

export function QueryStates({
  query,
  isEmpty,
  empty,
}: {
  query: QueryLike;
  isEmpty: boolean;
  empty: { icon: LucideIcon; title: string; description?: string; action?: { label: string; onPress: () => void } };
}) {
  if (query.isPending) return <Skeleton />;
  if (query.error) return <ErrorCard message={friendlyError(query.error)} onRetry={() => query.refetch()} />;
  if (isEmpty) return <EmptyState {...empty} />;
  return null;
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingVertical: 6 },
  row: { height: 52, borderRadius: 8, backgroundColor: colors.gray150 },
});
