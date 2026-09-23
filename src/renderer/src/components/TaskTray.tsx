import { CheckCircle2, CircleX, Ban, X } from 'lucide-react'
import type { TaskSnapshot } from '@shared/tasks'
import { Button } from '@/components/ui/button'
import { TaskProgress } from '@/components/TaskProgress'
import { useTasks } from '@/stores/tasks'
import { api } from '@/lib/api'
import { t } from '@/strings'

function TaskCard({ task }: { task: TaskSnapshot }) {
  const running = task.status === 'running'
  return (
    <div className="w-80 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{task.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {running && (task.step ?? t.tasks.working)}
            {task.status === 'done' && t.tasks.done}
            {task.status === 'cancelled' && t.tasks.cancelled}
            {task.status === 'failed' && (task.error ?? t.tasks.failed)}
          </p>
        </div>
        {task.status === 'done' && <CheckCircle2 className="size-4 text-success" />}
        {task.status === 'cancelled' && <Ban className="size-4 text-muted-foreground" />}
        {task.status === 'failed' && <CircleX className="size-4 text-destructive" />}
        {!running && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.tasks.dismiss}
            onClick={() => void api.tasks.dismiss(task.id)}
          >
            <X />
          </Button>
        )}
      </div>
      {running && (
        <div className="mt-2.5 space-y-1.5">
          <TaskProgress value={task.progress} />
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate tabular-nums">
              {task.detail ?? (task.progress !== null ? `${Math.round(task.progress * 100)}%` : '')}
            </span>
            {task.cancellable && (
              <Button variant="ghost" size="xs" onClick={() => void api.tasks.cancel(task.id)}>
                {t.tasks.cancel}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Floating stack of running and recently finished jobs, bottom-right. */
export function TaskTray() {
  const tasks = useTasks((s) => s.tasks)
  const list = Object.values(tasks).sort((a, b) => a.startedAt - b.startedAt)
  if (list.length === 0) return null
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {list.map((task) => (
        <div key={task.id} className="pointer-events-auto animate-in fade-in slide-in-from-bottom-2">
          <TaskCard task={task} />
        </div>
      ))}
    </div>
  )
}
