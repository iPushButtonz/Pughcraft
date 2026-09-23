import { Logo } from '@/components/Logo'
import { t } from '@/strings'

export function ServersPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 pb-16 text-center">
      <Logo className="size-16 opacity-90" />
      <h2 className="text-lg font-semibold">{t.servers.emptyTitle}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{t.servers.emptyBody}</p>
    </div>
  )
}
