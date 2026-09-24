import { cn } from 'cn'
import type { ServerStatus } from '@shared/servers'
import { t } from '@/strings'

const styles: Record<ServerStatus, { dot: string; text: string; pulse?: boolean }> = {
  installing: { dot: 'bg-warning', text: 'text-foreground', pulse: true },
  stopped: { dot: 'bg-muted-foreground/50', text: 'text-muted-foreground' },
  starting: { dot: 'bg-warning', text: 'text-foreground', pulse: true },
  running: { dot: 'bg-success', text: 'text-foreground' },
  stopping: { dot: 'bg-warning', text: 'text-foreground', pulse: true },
  crashed: { dot: 'bg-destructive', text: 'text-destructive' }
}

export function StatusBadge({ status, className }: { status: ServerStatus; className?: string }) {
  const s = styles[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', s.text, className)}>
      <span className="relative flex size-2">
        {s.pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', s.dot)} />}
        <span className={cn('relative size-2 rounded-full', s.dot)} />
      </span>
      {t.servers.status[status]}
    </span>
  )
}
