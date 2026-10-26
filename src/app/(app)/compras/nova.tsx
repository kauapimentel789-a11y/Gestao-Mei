import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { PickerModal } from '@/components/PickerModal';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAccounts } from '@/features/finance/api';
import { METHOD_LABEL, parseDateInput, type PaymentMethod, toISODate } from '@/features/finance/logic';
import { formatQuantity, parseQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useProducts } from '@/features/products/api';
import { ITEM_TYPE_LABEL } from '@/features/products/types';
import { useCreatePurchase } from '@/features/purchases/api';
import { purchaseDraftTotal } from '@/features/purchases/logic';
import { useSaveSupplier, useSuppliers } from '@/features/suppliers/api';
import { formatDateBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents, parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

const METHODS: PaymentMethod[] = ['pix', 'cash', 'debit_card', 'credit_card', 'bank_transfer', 'boleto', 'other'];
const centsToText = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

interface Line {
  key: string;
  productId: string;
  quantity: string;
  cost: string;
}

export default function NewPurchaseScreen() {
  const { fornecedorId } = useLocalSearchParams<{ fornecedorId?: string }>();
  const { orgId } = useOrg();
  const toast = useToast();
  const products = useProducts(orgId, { types: ['raw_material', 'resale', 'finished', 'consumable', 'component'], activeOnly: true });
  const suppliers = useSuppliers(orgId);
  const saveSupplier = useSaveSupplier(orgId);
  const accounts = useAccounts(orgId);
  const create = useCreatePurchase(orgId);

  const [key] = useState(newId);
  const [supplierId, setSupplierId] = useState<string | null>(fornecedorId ?? null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [date, setDate] = useState(formatDateBR(new Date()));
  const [due, setDue] = useState('');
  const [invoice, setInvoice] = useState('');
  const [notes, setNotes] = useState('');
  const [paidNow, setPaidNow] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [error, setError] = useState<string | null>(null);

  const productById = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const supplier = suppliers.data?.find((s) => s.id === supplierId) ?? null;
  const activeAccounts = (accounts.data ?? []).filter((a) => a.active);
  const chosenAccount = accountId ?? activeAccounts[0]?.id ?? null;

  const parsed = lines.map((l) => ({ ...l, q: parseQuantity(l.quantity), c: parseBRLToCents(l.cost) }));
  const total = purchaseDraftTotal(parsed.filter((l) => l.q !== null && l.c !== null).map((l) => ({ quantity: l.q!, unitCostCents: l.c! })));
  const update = (k: string, patch: Partial<Line>) => setLines((s) => s.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const submit = async () => {
    setError(null);
    if (lines.length === 0) return setError('Adicione pelo menos um item.');
    if (parsed.some((l) => l.q === null || l.c === null)) return setError('Confira quantidade e custo de todos os itens.');
    const purchaseDate = parseDateInput(date);
    if (!purchaseDate) return setError('Data da compra inválida. Use dd/mm/aaaa.');
    if (purchaseDate > toISODate(new Date())) return setError('A data da compra não pode ser futura.');
    const dueDate = due.trim() ? parseDateInput(due) : purchaseDate;
    if (!dueDate) return setError('Vencimento inválido. Use dd/mm/aaaa.');
    if (paidNow && !chosenAccount) return setError('Cadastre uma conta financeira antes.');
    try {
      const purchase = await create.mutateAsync({
        idempotencyKey: key,
        supplierId,
        purchaseDate,
        dueDate,
        invoiceRef: invoice.trim(),
        notes: notes.trim(),
        items: parsed.map((l) => ({ product_id: l.productId, quantity: l.q!, unit_cost_cents: l.c! })),
        paid: paidNow && chosenAccount ? { accountId: chosenAccount, method } : null,
      });
      toast(`Compra #${purchase.number} registrada`);
      router.replace({ pathname: '/compras/[id]', params: { id: purchase.id } });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title="Nova compra" />

      <Card>
        <Text style={styles.label}>Fornecedor</Text>
        <Pressable accessibilityRole="button" onPress={() => setSupplierOpen(true)} style={styles.select}>
          <Text style={[styles.selectText, !supplier && styles.placeholder]}>{supplier?.name ?? 'Sem fornecedor'}</Text>
          <ChevronRight size={18} color={colors.gray500} />
        </Pressable>
        <View style={styles.twoCols}>
          <View style={styles.flex}>
            <TextField label="Data da compra" value={date} onChangeText={setDate} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.flex}>
            <TextField label="Nota ou recibo (opcional)" value={invoice} onChangeText={setInvoice} />
          </View>
        </View>
      </Card>

      <Card style={styles.itemsCard}>
        <Text style={styles.label}>Itens</Text>
        {lines.map((l) => {
          const p = productById.get(l.productId);
          return (
            <View key={l.key} style={styles.line}>
              <View style={styles.lineHeader}>
                <View style={styles.flex}>
                  <Text style={styles.itemName}>{p?.name ?? 'Item'}</Text>
                  {p?.track_stock ? (
                    <Text style={styles.muted}>
                      Em estoque: {formatQuantity(p.stock_qty)} {p.unit}
                    </Text>
                  ) : (
                    <Text style={styles.muted}>Não controla estoque: só registra o custo</Text>
                  )}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${p?.name ?? 'item'}`} hitSlop={10} onPress={() => setLines((s) => s.filter((x) => x.key !== l.key))}>
                  <Trash2 size={18} color={colors.gray500} />
                </Pressable>
              </View>
              <View style={styles.twoCols}>
                <View style={styles.flex}>
                  <TextField label={`Quantidade (${p?.unit ?? 'un'})`} value={l.quantity} onChangeText={(t) => update(l.key, { quantity: t })} keyboardType="decimal-pad" />
                </View>
                <View style={styles.flex}>
                  <TextField label="Custo unitário" value={l.cost} onChangeText={(t) => update(l.key, { cost: t })} keyboardType="decimal-pad" placeholder="0,00" />
                </View>
              </View>
            </View>
          );
        })}
        <Pressable accessibilityRole="button" onPress={() => setProductOpen(true)} style={styles.addLine}>
          <Plus size={18} color={colors.primaryText} />
          <Text style={styles.addLineText}>Adicionar item</Text>
        </Pressable>
      </Card>

      <Card>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.value}>Já paguei</Text>
            <Text style={styles.muted}>{paidNow ? 'O pagamento sai do caixa na data da compra.' : 'Fica em contas a pagar até você registrar o pagamento.'}</Text>
          </View>
          <Switch value={paidNow} onValueChange={setPaidNow} trackColor={{ true: colors.primary }} accessibilityLabel="Já paguei" />
        </View>
        {paidNow ? (
          <>
            <Text style={styles.label}>Saiu de</Text>
            <Chips accessibilityLabel="Conta" value={chosenAccount} onChange={setAccountId} options={activeAccounts.map((a) => ({ value: a.id, label: a.name }))} />
            <Text style={styles.label}>Forma</Text>
            <Chips accessibilityLabel="Forma de pagamento" value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
          </>
        ) : (
          <TextField label="Vencimento (opcional)" value={due} onChangeText={setDue} placeholder="Igual à data da compra" keyboardType="numbers-and-punctuation" />
        )}
        <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline />
      </Card>

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total da compra</Text>
          <Text style={styles.summaryValue}>{formatCents(total)}</Text>
        </View>
        <Text style={styles.summaryHint}>
          Ao salvar: os itens entram no estoque, o custo de cada item vira o custo médio e a compra vai para contas a pagar como compra de estoque (fora das
          despesas do resultado).
        </Text>
      </View>

      <FormError message={error} />
      <Button label="Registrar compra" onPress={submit} loading={create.isPending} />

      <PickerModal
        visible={supplierOpen}
        title="Fornecedor"
        searchPlaceholder="Buscar fornecedor"
        options={(suppliers.data ?? []).filter((s) => s.active).map((s) => ({ id: s.id, title: s.name, subtitle: s.phone ?? undefined }))}
        loading={suppliers.isPending}
        selectedId={supplierId}
        noneLabel="Sem fornecedor"
        emptyText="Nenhum fornecedor encontrado."
        header={(term) =>
          term ? (
            <Pressable
              accessibilityRole="button"
              style={styles.addLine}
              onPress={async () => {
                try {
                  const s = await saveSupplier.mutateAsync({ input: { name: term, document: '', phone: '', email: '', notes: '', contact_name: '', address: '', supplies: '', active: true } });
                  setSupplierId(s.id);
                  setSupplierOpen(false);
                } catch (e) {
                  setError(friendlyError(e));
                  setSupplierOpen(false);
                }
              }}
            >
              <Plus size={18} color={colors.primaryText} />
              <Text style={styles.addLineText}>Cadastrar “{term}”</Text>
            </Pressable>
          ) : null
        }
        onClose={() => setSupplierOpen(false)}
        onSelect={(id) => {
          setSupplierId(id);
          setSupplierOpen(false);
        }}
      />

      <PickerModal
        visible={productOpen}
        title="Item comprado"
        searchPlaceholder="Buscar item"
        options={(products.data ?? []).map((p) => ({ id: p.id, title: p.name, subtitle: `${ITEM_TYPE_LABEL[p.item_type]} · ${p.unit}` }))}
        loading={products.isPending}
        selectedId={null}
        emptyText="Nenhum item encontrado. Cadastre o item em Itens antes de comprar."
        onClose={() => setProductOpen(false)}
        onSelect={(id) => {
          const p = id ? productById.get(id) : undefined;
          if (p) setLines((s) => [...s, { key: newId(), productId: p.id, quantity: '1', cost: centsToText(p.cost_cents) }]);
          setProductOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  value: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  select: {
    minHeight: 50,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  placeholder: { color: colors.gray500 },
  twoCols: { flexDirection: 'row', gap: 10 },
  itemsCard: { gap: 10 },
  line: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  addLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  addLineText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryText },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  summary: { backgroundColor: colors.graphite, borderRadius: radius.card, padding: 18, gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray400 },
  summaryValue: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.white },
  summaryHint: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray400, lineHeight: 16 },
});
