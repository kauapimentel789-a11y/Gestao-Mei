import { filterTasks, isTaskLate, nextActions, sortTasks, type TaskLike } from '@/features/tasks/logic';

const task = (over: Partial<TaskLike & { id: string }>): TaskLike & { id: string } => ({
  id: 'x',
  status: 'todo',
  priority: 'normal',
  due_date: null,
  created_at: '2026-10-01T10:00:00Z',
  completed_at: null,
  ...over,
});

const TODAY = '2026-10-24';

describe('isTaskLate', () => {
  it('só tarefas abertas com prazo vencido', () => {
    expect(isTaskLate(task({ due_date: '2026-10-23' }), TODAY)).toBe(true);
    expect(isTaskLate(task({ due_date: TODAY }), TODAY)).toBe(false);
    expect(isTaskLate(task({ due_date: '2026-10-23', status: 'done' }), TODAY)).toBe(false);
    expect(isTaskLate(task({}), TODAY)).toBe(false);
  });
});

describe('filterTasks', () => {
  const list = [
    task({ id: 'sem-prazo' }),
    task({ id: 'hoje', due_date: TODAY }),
    task({ id: 'atrasada', due_date: '2026-10-20' }),
    task({ id: 'amanha', due_date: '2026-10-25' }),
    task({ id: 'feita', status: 'done', due_date: TODAY, completed_at: '2026-10-24T09:00:00Z' }),
    task({ id: 'cancelada', status: 'cancelled', due_date: TODAY }),
  ];
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it('hoje inclui atrasadas e exclui fechadas', () => {
    expect(ids(filterTasks(list, 'today', TODAY))).toEqual(['atrasada', 'hoje']);
  });
  it('abertas ordena por prazo, sem prazo no fim', () => {
    expect(ids(filterTasks(list, 'open', TODAY))).toEqual(['atrasada', 'hoje', 'amanha', 'sem-prazo']);
  });
  it('concluídas não inclui canceladas', () => {
    expect(ids(filterTasks(list, 'done', TODAY))).toEqual(['feita']);
  });
});

describe('sortTasks', () => {
  it('no mesmo prazo, prioridade alta primeiro e depois a ordem das etapas', () => {
    const sorted = sortTasks([
      task({ id: 'b', position: 2 }),
      task({ id: 'a', position: 1 }),
      task({ id: 'alta', priority: 'high', position: 3 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['alta', 'a', 'b']);
  });
});

describe('nextActions', () => {
  it('concluída só reabre; cancelada não tem ações', () => {
    expect(nextActions('done').map((a) => a.status)).toEqual(['todo']);
    expect(nextActions('cancelled')).toEqual([]);
  });
  it('a primeira ação de uma tarefa a fazer é começar', () => {
    expect(nextActions('todo')[0].status).toBe('in_progress');
  });
});
