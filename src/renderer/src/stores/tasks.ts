import { create } from 'zustand'
import type { TaskSnapshot } from '@shared/tasks'
import { api } from '@/lib/api'

interface TasksState {
  tasks: Record<string, TaskSnapshot>
}

export const useTasks = create<TasksState>(() => ({ tasks: {} }))

api.tasks.onUpdate((task) =>
  useTasks.setState((s) => ({ tasks: { ...s.tasks, [task.id]: task } }))
)
api.tasks.onRemove((id) =>
  useTasks.setState((s) => {
    const { [id]: _removed, ...rest } = s.tasks
    return { tasks: rest }
  })
)
void api.tasks
  .list()
  .then((list) => useTasks.setState({ tasks: Object.fromEntries(list.map((t) => [t.id, t])) }))
