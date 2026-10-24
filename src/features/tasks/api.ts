import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { TaskPriority, TaskStatus } from './logic';

export interface TaskOverview {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  order_id: string | null;
  order_number: number | null;
  customer_name: string | null;
  step_key: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskHistoryRow {
  id: number;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  note: string | null;
  changed_by: string;
  changed_at: string;
}

export interface Member {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  name: string;
}

const COLUMNS =
  'id, title, description, status, priority, due_date, assignee_id, assignee_name, order_id, order_number, customer_name, step_key, position, completed_at, created_at, updated_at';

export const taskKeys = {
  all: (orgId: string) => ['tasks', orgId] as const,
  list: (orgId: string) => ['tasks', orgId, 'list'] as const,
  order: (orgId: string, orderId: string) => ['tasks', orgId, 'order', orderId] as const,
  detail: (orgId: string, id: string) => ['tasks', orgId, 'detail', id] as const,
  members: (orgId: string) => ['tasks', orgId, 'members'] as const,
};

/** Tarefas abertas e as concluídas nos últimos 30 dias (o filtro da tela é local). */
export function useTasks(orgId: string) {
  return useQuery({
    queryKey: taskKeys.list(orgId),
    queryFn: async (): Promise<TaskOverview[]> => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('task_overview')
        .select(COLUMNS)
        .eq('organization_id', orgId)
        .or(`status.in.(todo,in_progress,blocked),and(status.eq.done,completed_at.gte.${since})`)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as TaskOverview[];
    },
  });
}

export function useOrderTasks(orgId: string, orderId: string) {
  return useQuery({
    queryKey: taskKeys.order(orgId, orderId),
    queryFn: async (): Promise<TaskOverview[]> => {
      const { data, error } = await supabase
        .from('task_overview')
        .select(COLUMNS)
        .eq('order_id', orderId)
        .order('position')
        .order('created_at');
      if (error) throw error;
      return data as TaskOverview[];
    },
  });
}

export function useTask(orgId: string, id: string | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(orgId, id ?? 'nova'),
    enabled: Boolean(id),
    queryFn: async (): Promise<TaskOverview & { history: TaskHistoryRow[] }> => {
      const [task, history] = await Promise.all([
        supabase.from('task_overview').select(COLUMNS).eq('id', id!).single(),
        supabase.from('task_history').select('id, from_status, to_status, note, changed_by, changed_at').eq('task_id', id!).order('id', { ascending: false }),
      ]);
      if (task.error) throw task.error;
      if (history.error) throw history.error;
      return { ...(task.data as TaskOverview), history: history.data as TaskHistoryRow[] };
    },
  });
}

/** Membros da empresa, para escolher o responsável. */
export function useMembers(orgId: string) {
  return useQuery({
    queryKey: taskKeys.members(orgId),
    queryFn: async (): Promise<Member[]> => {
      const members = await supabase.from('organization_members').select('user_id, role').eq('organization_id', orgId);
      if (members.error) throw members.error;
      const rows = members.data as { user_id: string; role: Member['role'] }[];
      const profiles = await supabase
        .from('profiles')
        .select('id, display_name')
        .in(
          'id',
          rows.map((m) => m.user_id),
        );
      if (profiles.error) throw profiles.error;
      const names = new Map((profiles.data as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
      return rows
        .map((m) => ({ ...m, name: names.get(m.user_id) || 'Sem nome' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    },
  });
}

function useInvalidateTasks(orgId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: taskKeys.all(orgId) });
}

export interface TaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: string | null;
}

export function useSaveTask(orgId: string) {
  const invalidate = useInvalidateTasks(orgId);
  return useMutation({
    mutationFn: async ({
      id,
      input,
      idempotencyKey,
      orderId,
    }: {
      id?: string;
      input: TaskInput;
      idempotencyKey: string;
      orderId: string | null;
    }): Promise<{ id: string }> => {
      const { data, error } = id
        ? await supabase.rpc('update_task', {
            p_task_id: id,
            p_title: input.title,
            p_description: input.description || null,
            p_priority: input.priority,
            p_due_date: input.dueDate,
            p_assignee_id: input.assigneeId,
          })
        : await supabase.rpc('create_task', {
            p_organization_id: orgId,
            p_title: input.title,
            p_idempotency_key: idempotencyKey,
            p_description: input.description || null,
            p_priority: input.priority,
            p_due_date: input.dueDate,
            p_assignee_id: input.assigneeId,
            p_order_id: orderId,
          });
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: invalidate,
  });
}

export function useSetTaskStatus(orgId: string) {
  const invalidate = useInvalidateTasks(orgId);
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: TaskStatus; note?: string }) => {
      const { error } = await supabase.rpc('set_task_status', { p_task_id: id, p_status: status, p_note: note || null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useGenerateOrderTasks(orgId: string) {
  const invalidate = useInvalidateTasks(orgId);
  return useMutation({
    mutationFn: async (orderId: string): Promise<number> => {
      const { data, error } = await supabase.rpc('generate_order_tasks', { p_order_id: orderId });
      if (error) throw error;
      return (data as unknown[]).length;
    },
    onSuccess: invalidate,
  });
}
