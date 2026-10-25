// Agendamento da ordem de serviço, no detalhe do pedido.
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/features/organizations/useOrg';
import { formatWhen } from '@/lib/dates';
import { colors, fonts } from '@/theme/tokens';

import { useScheduleOrder } from './api';
import { durationLabel } from './logic';
import { ScheduleDialog } from './ScheduleDialog';

export function ServiceSchedule({
  orderId,
  scheduledFor,
  minutes,
  closed,
  onScheduled,
}: {
  orderId: string;
  scheduledFor: string | null;
  minutes: number | null;
  closed: boolean;
  /** Depois de salvar: a data nova, ou null quando saiu da agenda. */
  onScheduled?: (at: Date | null) => void;
}) {
  const { orgId } = useOrg();
  const schedule = useScheduleOrder(orgId);
  const toast = useToast();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <Text style={styles.cardTitle}>Agenda</Text>
      <Text style={styles.body}>
        {scheduledFor ? `${formatWhen(new Date(scheduledFor))} · duração prevista ${durationLabel(minutes)}` : 'Ainda sem data marcada.'}
      </Text>
      {!closed ? <Button variant="tint" size="medium" label={scheduledFor ? 'Reagendar' : 'Agendar'} onPress={() => setOpen(true)} /> : null}
      {open ? (
        <ScheduleDialog
          current={scheduledFor}
          minutes={minutes}
          loading={schedule.isPending}
          onClose={() => setOpen(false)}
          onSave={async ({ at, minutes: m, reason }) => {
            await schedule.mutateAsync({ orderId, at, minutes: m, reason });
            setOpen(false);
            toast(at ? 'Agendado' : 'Tirado da agenda');
            onScheduled?.(at);
          }}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
});
