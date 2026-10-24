import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Linking, Platform, StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useOrders } from '@/features/orders/api';
import { useOrg } from '@/features/organizations/useOrg';
import { colors, fonts } from '@/theme/tokens';

import { syncLateAlerts } from './LateOrderAlerts';
import { planLateAlerts } from './logic';

/** Card de Configurações para ligar os avisos de atraso (permissão do sistema). */
export function AlertsCard() {
  if (Platform.OS === 'web') return null;
  return <NativeAlertsCard />;
}

function NativeAlertsCard() {
  const { orgId, config } = useOrg();
  const qc = useQueryClient();
  const open = useOrders(orgId, 'open');
  const permission = useQuery({ queryKey: ['notification-permission'], queryFn: () => Notifications.getPermissionsAsync() });
  const p = permission.data;
  const plural = config.tabLabels.pedidos.toLowerCase();

  const enable = async () => {
    const result = await Notifications.requestPermissionsAsync();
    qc.setQueryData(['notification-permission'], result);
    if (result.granted && open.data) await syncLateAlerts(planLateAlerts(open.data, config.orderNoun));
  };

  return (
    <Card>
      <Text style={styles.title}>Aviso de atraso</Text>
      <Text style={styles.body}>
        {!p
          ? 'Verificando…'
          : p.granted
            ? `Ligado. O celular avisa na hora em que o prazo de um dos ${plural} em aberto vencer.`
            : `Desligado. Ligue para o celular avisar quando o prazo de ${plural} em aberto vencer, mesmo com o app fechado.`}
      </Text>
      {p && !p.granted ? (
        p.canAskAgain ? (
          <Button size="medium" label="Ligar avisos" onPress={enable} />
        ) : (
          <Button size="medium" variant="tint" label="Abrir ajustes do celular" onPress={() => Linking.openSettings()} />
        )
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
});
