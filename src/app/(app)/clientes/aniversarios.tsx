// Próximos aniversários (60 dias), com a mensagem pronta no WhatsApp.
import { router } from 'expo-router';
import { Cake } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { useUpcomingBirthdays } from '@/features/customers/api';
import { BirthdayRow } from '@/features/customers/Birthdays';
import { useOrg } from '@/features/organizations/useOrg';
import { colors, fonts } from '@/theme/tokens';

export default function BirthdaysScreen() {
  const { orgId, config } = useOrg();
  const list = useUpcomingBirthdays(orgId, 60);
  const clients = config.clientsLabel.toLowerCase();

  return (
    <Screen>
      <DetailBar title="Aniversários" />
      <Text style={styles.hint}>
        {config.type === 'production'
          ? `Aniversários dos próximos 60 dias. Mande uma mensagem alguns dias antes: é quando ${clients} costumam encomendar.`
          : `Aniversários dos próximos 60 dias. Um toque no balão abre o WhatsApp com a mensagem pronta.`}
      </Text>
      <Card style={styles.list}>
        <QueryStates
          query={list}
          isEmpty={list.data?.length === 0}
          empty={{
            icon: Cake,
            title: 'Nenhum aniversário nos próximos 60 dias',
            description: `Coloque a data de aniversário no cadastro de ${clients} para ser lembrado aqui e na Início.`,
            action: { label: `Ver ${clients}`, onPress: () => router.push('/clientes') },
          }}
        />
        {list.data?.map((b, i) => (
          <BirthdayRow key={b.id} item={b} first={i === 0} />
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray500 },
  list: { paddingVertical: 4, gap: 0 },
});
