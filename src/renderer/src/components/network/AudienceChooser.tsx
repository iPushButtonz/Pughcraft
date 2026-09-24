import { Globe, Monitor, Wifi, type LucideIcon } from 'lucide-react'
import { cn } from 'cn'
import type { Audience } from '@shared/network'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { t } from '@/strings'

type Choice = Exclude<Audience, 'unset'>

const CHOICES: { value: Choice; icon: LucideIcon }[] = [
  { value: 'self', icon: Monitor },
  { value: 'lan', icon: Wifi },
  { value: 'internet', icon: Globe }
]

/** Three big buttons: Just me / People on my Wi-Fi / Friends anywhere. */
export function AudienceChooser({
  value,
  onChoose,
  compact = false
}: {
  value: Audience
  onChoose: (choice: Choice) => void
  compact?: boolean
}) {
  return (
    <div role="radiogroup" className={cn('grid gap-3', compact ? 'sm:grid-cols-3' : 'sm:grid-cols-3')}>
      {CHOICES.map(({ value: v, icon: Icon }) => {
        const selected = value === v
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChoose(v)}
            className={cn(
              'flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors',
              selected ? 'border-primary bg-accent' : 'bg-card hover:border-primary/40'
            )}
          >
            <Icon className={cn('size-6', selected ? 'text-primary' : 'text-muted-foreground')} />
            <span className="text-sm font-semibold">{t.network.audience[v].label}</span>
            {!compact && <span className="text-xs text-muted-foreground">{t.network.audience[v].hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Asked the first time a server starts (owner's choice). */
export function AudienceDialog({
  open,
  onOpenChange,
  onChoose
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChoose: (choice: Choice) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.network.chooserTitle}</DialogTitle>
          <DialogDescription>{t.network.chooserHint}</DialogDescription>
        </DialogHeader>
        <AudienceChooser value="unset" onChoose={onChoose} />
      </DialogContent>
    </Dialog>
  )
}
