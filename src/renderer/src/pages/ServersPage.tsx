import { useState } from 'react'
import { Clock, Download, Plus, Users } from 'lucide-react'
import { useImportUi } from '@/components/imports/GlobalImport'
import { timeAgo } from '@/lib/time'
import { LOADER_LABELS, type ServerSummary } from '@shared/servers'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/Logo'
import { StatusBadge } from '@/components/servers/StatusBadge'
import { PowerButtons } from '@/components/servers/PowerButtons'
import { CreateServerDialog } from '@/components/servers/CreateServerDialog'
import { TaskProgress } from '@/components/TaskProgress'
import { useServers } from '@/stores/servers'
import { useTasks } from '@/stores/tasks'
import { useNav } from '@/stores/nav'
import { t } from '@/strings'

function ServerCard({ server }: { server: ServerSummary }) {
  const open = useNav((s) => s.openServer)
  const task = useTasks((s) => (server.taskId ? s.tasks[server.taskId] : undefined))
  const c = server.config
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(c.id)}
      onKeyDown={(e) => e.key === 'Enter' && open(c.id)}
      className="group flex flex-col gap-4 rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{c.name}</h3>
          <p className="text-sm text-muted-foreground">
            Minecraft {c.mcVersion} · {LOADER_LABELS[c.loader]}
          </p>
        </div>
        <StatusBadge status={server.status} />
      </div>
      {server.status === 'installing' && task ? (
        <div className="space-y-1.5">
          <TaskProgress value={task.progress} />
          <p className="truncate text-xs text-muted-foreground">{task.step ?? t.tasks.working}</p>
        </div>
      ) : server.problem ? (
        <p className="line-clamp-2 text-sm text-destructive">{server.problem}</p>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {server.status === 'running' ? (
            <>
              <Users className="size-4" />
              {t.servers.players(server.players.length, server.maxPlayers)}
            </>
          ) : (
            <>
              <Clock className="size-4" />
              {c.lastStartedAt ? t.servers.lastStarted(timeAgo(c.lastStartedAt)) : t.servers.neverStarted}
            </>
          )}
        </p>
      )}
      <div className="mt-auto flex justify-end">
        <PowerButtons server={server} size="sm" />
      </div>
    </div>
  )
}

export function ServersPage() {
  const servers = useServers((s) => s.servers)
  const loaded = useServers((s) => s.loaded)
  const showImport = useImportUi((s) => s.show)
  const [creating, setCreating] = useState(false)
  const list = Object.values(servers).sort((a, b) =>
    a.config.createdAt.localeCompare(b.config.createdAt)
  )

  if (!loaded) return null

  return (
    <>
      {list.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 pb-16 text-center">
          <Logo className="size-16 opacity-90" />
          <h2 className="text-lg font-semibold">{t.servers.emptyTitle}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{t.servers.emptyBody}</p>
          <div className="mt-2 flex gap-2">
            <Button size="lg" onClick={() => setCreating(true)}>
              <Plus />
              {t.servers.create}
            </Button>
            <Button size="lg" variant="outline" onClick={() => showImport()}>
              <Download />
              {t.imports.button}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t.imports.dropHere}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => showImport()}>
              <Download />
              {t.imports.button}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t.servers.create}
            </Button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {list.map((s) => (
              <ServerCard key={s.config.id} server={s} />
            ))}
          </div>
        </div>
      )}
      <CreateServerDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}
