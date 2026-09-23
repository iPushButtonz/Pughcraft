import { cn } from 'cn'

/** A progress bar that slides when the total is unknown (`value` null). */
export function TaskProgress({ value, className }: { value: number | null; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(value * 100)}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-primary/15', className)}
    >
      {value === null ? (
        <div className="animate-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-primary" />
      ) : (
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200"
          style={{ width: `${value * 100}%` }}
        />
      )}
    </div>
  )
}
