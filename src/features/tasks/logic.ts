// Regras de exibição das tarefas. Transições e validações ficam no banco
// (set_task_status); aqui só o que a tela mostra.

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskFilter = 'today' | 'open' | 'done';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  blocked: 'Bloqueada',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'Alta',
  normal: 'Normal',
  low: 'Baixa',
};

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

export interface TaskLike {
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  position?: number;
  created_at: string;
  completed_at?: string | null;
}

export function isOpenTask(t: { status: TaskStatus }): boolean {
  return t.status !== 'done' && t.status !== 'cancelled';
}

/** Atrasada: aberta e com prazo antes de hoje (datas ISO no fuso do aparelho). */
export function isTaskLate(t: { status: TaskStatus; due_date: string | null }, todayISO: string): boolean {
  return isOpenTask(t) && t.due_date !== null && t.due_date < todayISO;
}

/** Abertas: atrasadas e com prazo primeiro, depois prioridade; concluídas: mais recentes primeiro. */
export function sortTasks<T extends TaskLike>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const openA = isOpenTask(a);
    const openB = isOpenTask(b);
    if (openA !== openB) return openA ? -1 : 1;
    if (!openA) return (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at);
    if (a.due_date !== b.due_date) {
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if ((a.position ?? 0) !== (b.position ?? 0)) return (a.position ?? 0) - (b.position ?? 0);
    return a.created_at.localeCompare(b.created_at);
  });
}

export function filterTasks<T extends TaskLike>(tasks: T[], filter: TaskFilter, todayISO: string): T[] {
  const picked = tasks.filter((t) => {
    if (filter === 'done') return t.status === 'done';
    if (!isOpenTask(t)) return false;
    return filter === 'open' || (t.due_date !== null && t.due_date <= todayISO);
  });
  return sortTasks(picked);
}

/** Ações oferecidas no detalhe, conforme o status atual. */
export function nextActions(status: TaskStatus): { status: TaskStatus; label: string }[] {
  switch (status) {
    case 'todo':
      return [
        { status: 'in_progress', label: 'Começar' },
        { status: 'done', label: 'Concluir' },
        { status: 'blocked', label: 'Bloquear' },
      ];
    case 'in_progress':
      return [
        { status: 'done', label: 'Concluir' },
        { status: 'blocked', label: 'Bloquear' },
        { status: 'todo', label: 'Voltar para a fazer' },
      ];
    case 'blocked':
      return [
        { status: 'in_progress', label: 'Desbloquear' },
        { status: 'done', label: 'Concluir' },
      ];
    case 'done':
      return [{ status: 'todo', label: 'Reabrir' }];
    default:
      return [];
  }
}
