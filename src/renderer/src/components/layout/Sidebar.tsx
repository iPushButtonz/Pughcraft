import { useMemo } from 'react'
import { Download, Settings as SettingsIcon } from 'lucide-react'
import { cn } from 'cn'
import { APP_NAME } from '@shared/brand'
import type { ServerStatus } from '@shared/servers'
import { Logo } from '@/components/Logo'
import { useImportUi } from '@/components/imports/GlobalImport'
import { useNav } from '@/stores/nav'
import { useServers } from '@/stores/servers'
import { t } from '@/strings'

const DOT: Record<ServerStatus, string> = {
  installing: 'bg-warning',
  stopped: 'bg-muted-foreground/50',
  starting: 'bg-warning',
  running: 'bg-success',
  stopping: 'bg-warning',
  crashed: 'bg-destructive'
}

const row =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'

export function Sidebar() {
  const page = useNav((s) => s.page)
  const serverId = useNav((s) => s.serverId)
  const go = useNav((s) => s.go)
  const openServer = useNav((s) => s.openServer)
  const showImport = useImportUi((s) => s.show)
  const serversMap = useServers((s) => s.servers)
  const servers = useMemo(
    () => Object.values(serversMap).sort((a, b) => a.config.createdAt.localeCompare(b.config.createdAt)),
    [serversMap]
  )

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <button type="button" onClick={() => go('servers')} className="flex items-center gap-2.5 px-4 pt-5 pb-4 text-left">
        <Logo className="size-8" />
        <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
      </button>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2">
        {servers.map((s) => {
          const active = page === 'server' && serverId === s.config.id
          return (
            <button
              key={s.config.id}
              type="button"
              onClick={() => openServer(s.config.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(row, active && 'bg-sidebar-accent text-sidebar-foreground')}
            >
              <span className={cn('size-2 shrink-0 rounded-full', DOT[s.status])} />
              <span className="truncate">{s.config.name}</span>
            </button>
          )
        })}
        <button type="button" onClick={() => showImport()} className={cn(row, 'text-sidebar-foreground/60')}>
          <Download className="size-4" />
          {t.imports.button}
        </button>
      </nav>
      <div className="px-2 pb-3">
        <button
          type="button"
          onClick={() => go('settings')}
          aria-current={page === 'settings' ? 'page' : undefined}
          className={cn(row, page === 'settings' && 'bg-sidebar-accent text-sidebar-foreground')}
        >
          <SettingsIcon className="size-4" />
          {t.nav.settings}
        </button>
      </div>
    </aside>
  )
}
