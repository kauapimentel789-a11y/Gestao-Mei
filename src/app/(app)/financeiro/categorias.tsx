import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useCategories, useCreateCategory, useUpdateCategory } from '@/features/finance/api';
import { type CategoryNature, type Direction, NATURE_LABEL, NATURES_BY_DIRECTION, PERSONAL_NATURE } from '@/features/finance/logic';
import { useSpace } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { colors, fonts } from '@/theme/tokens';

export default function CategoriesScreen() {
  const { orgId, personal } = useSpace();
  const categories = useCategories(orgId);
  const create = useCreateCategory(orgId);
  const update = useUpdateCategory(orgId);
  const toast = useToast();
  const [direction, setDirection] = useState<Direction>('payable');
  const [name, setName] = useState('');
  const [nature, setNature] = useState<CategoryNature>('operating_expense');
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const list = (categories.data ?? []).filter((c) => c.direction === direction);

  const add = async () => {
    if (name.trim().length < 2) return setNameError('Informe o nome.');
    setNameError(undefined);
    setError(null);
    try {
      await create.mutateAsync({ name, direction, nature });
      setName('');
      toast('Categoria criada');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title="Categorias" />
      <SegmentedControl
        accessibilityLabel="Tipo"
        value={direction}
        onChange={(d) => {
          setDirection(d);
          setNature(personal ? PERSONAL_NATURE[d] : NATURES_BY_DIRECTION[d][0]!);
        }}
        segments={[
          { value: 'payable', label: personal ? 'Gastos' : 'Despesas' },
          { value: 'receivable', label: personal ? 'Entradas' : 'Receitas' },
        ]}
      />

      <Card style={styles.list}>
        {categories.isPending ? <Skeleton /> : null}
        {list.map((c, i) => (
          <View key={c.id} style={[styles.row, i > 0 && styles.divider, !c.active && styles.inactive]}>
            <View style={styles.flex}>
              <Text style={styles.name}>{c.name}</Text>
              {personal ? null : <Text style={styles.muted}>{NATURE_LABEL[c.nature]}</Text>}
            </View>
            <Switch
              value={c.active}
              onValueChange={async (active) => {
                setError(null);
                try {
                  await update.mutateAsync({ id: c.id, active });
                } catch (e) {
                  setError(friendlyError(e));
                }
              }}
              trackColor={{ true: colors.primary }}
              accessibilityLabel={`Categoria ${c.name} ativa`}
            />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Nova categoria</Text>
        <TextField label="Nome" value={name} onChangeText={setName} error={nameError} />
        {personal ? null : (
          <>
            <Text style={styles.label}>Natureza</Text>
            <Chips accessibilityLabel="Natureza" value={nature} onChange={setNature} options={NATURES_BY_DIRECTION[direction].map((n) => ({ value: n, label: NATURE_LABEL[n] }))} />
            <Text style={styles.muted}>
              A natureza define onde o valor aparece: só vendas, despesas do negócio e impostos entram no resultado estimado. Compras de estoque, investimentos e
              retiradas aparecem separados.
            </Text>
          </>
        )}
        <FormError message={error} />
        <Button size="medium" label="Criar categoria" onPress={add} loading={create.isPending} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  list: { gap: 0, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  inactive: { opacity: 0.55 },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
});
