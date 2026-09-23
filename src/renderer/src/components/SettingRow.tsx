import type { ReactNode } from 'react'
import { cn } from 'cn'

/** A labelled setting: text on the left, control on the right (or below when `stacked`). */
export function SettingRow({
  label,
  hint,
  children,
  stacked = false,
  htmlFor
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  stacked?: boolean
  htmlFor?: string
}) {
  return (
    <div className={cn('flex gap-4 py-4', stacked ? 'flex-col' : 'items-center justify-between')}>
      <div className="min-w-0 space-y-1">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      <div className={cn(!stacked && 'shrink-0')}>{children}</div>
    </div>
  )
}

export function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="divide-y rounded-lg border bg-card px-4">{children}</div>
    </section>
  )
}
