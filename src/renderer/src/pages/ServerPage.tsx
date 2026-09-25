import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, FolderOpen, MoreHorizontal, RotateCw, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { LOADER_LABELS, type ServerSummary } from '@shared/servers'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { StatusBadge } from '@/components/servers/StatusBadge'
import { PowerButtons } from '@/components/servers/PowerButtons'
import { ConsoleView } from '@/components/servers/ConsoleView'
import { ServerSettingsPanel } from '@/components/servers/ServerSettingsPanel'
import { TaskProgress } from '@/components/TaskProgress'
import { CopyField } from '@/components/CopyField'
import { AudienceChooser } from '@/components/network/AudienceChooser'
import { NetworkPanel, useServerNetwork } from '@/components/network/NetworkPanel'
import { ShareButton } from '@/components/network/ShareButton'
import { WorldsPanel } from '@/components/servers/WorldsPanel'
import { BackupsPanel } from '@/components/servers/BackupsPanel'
import { PlayersPanel, PlayerMenu } from '@/components/servers/PlayersPanel'
import { FilesPanel } from '@/components/servers/FilesPanel'
import { useIsAdvanced } from '@/stores/settings'
import { useServer, useServers } from '@/stores/servers'
import { formatBytes } from '@shared/format'
import { useTasks } from '@/stores/tasks'
import { useNav } from '@/stores/nav'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { t } from '@/strings'

const d = t.dashboard

async function attempt(action: () => Promise<unknown>): Promise<void> {
  try {
    await action()
  } catch (err) {
    toast.error(errorMessage(err))
  }
}

function JoinCard({ server }: { server: ServerSummary }) {
  const view = useServerNetwork(server.config.id)
  if (!view) return null
  const audience = view.config.audience
  const rows: { label: string; value: string | null; note?: string }[] = [
    { label: t.network.thisPc, value: view.addresses.thisPc }
  ]
  if (audience === 'lan' || audience === 'internet') rows.push({ label: t.network.sameWifi, value: view.addresses.lan })
  if (audience === 'internet') {
    rows.push({
      label: t.network.internet,
      value: view.addresses.internet,
      note: view.addresses.internet ? undefined : view.internet.message
    })
  }
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold">{d.howToJoin}</h3>
      {rows.map((r) => (
        <div key={r.label} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{r.label}</p>
          {r.value ? <CopyField value={r.value} /> : <p className="text-sm text-muted-foreground">{r.note ?? t.network.notAvailable}</p>}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{d.joinHereHint}</p>
    </section>
  )
}

function Meter({ label, value, fraction, hint }: { label: string; value: string; fraction: number | null; hint: string }) {
  return (
    <div className="space-y-1.5" title={hint}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${fraction !== null && fraction > 0.9 ? 'bg-warning' : 'bg-primary'}`}
          style={{ width: `${Math.round((fraction ?? 0) * 100)}%` }}
        />
      </div>
    </div>
  )
}

function UsageCard({ server }: { server: ServerSummary }) {
  const stats = useServers((s) => s.stats[server.config.id])
  const maxBytes = server.config.memoryMb * 1024 * 1024
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold">{d.usage}</h3>
      {!stats ? (
        <p className="text-sm text-muted-foreground">{d.measuring}</p>
      ) : (
        <>
          <Meter label={d.cpu} value={`${stats.cpuPercent.toFixed(0)}%`} fraction={stats.cpuPercent / 100} hint={d.cpuHint} />
          <Meter
            label={d.memory}
            value={d.memoryOf(formatBytes(stats.memoryBytes), formatBytes(maxBytes))}
            fraction={Math.min(1, stats.memoryBytes / maxBytes)}
            hint={d.memoryHint}
          />
        </>
      )}
    </section>
  )
}

function Overview({ server }: { server: ServerSummary }) {
  const task = useTasks((s) => (server.taskId ? s.tasks[server.taskId] : undefined))
  const audience = server.config.network?.audience ?? 'unset'
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {audience === 'unset' && (
        <section className="space-y-3 rounded-xl border border-primary/40 bg-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold">{t.network.chooserTitle}</h3>
          <AudienceChooser
            value="unset"
            onChoose={(choice) =>
              void api.network.setAudience(server.config.id, choice).catch((err) => toast.error(errorMessage(err)))
            }
          />
          <p className="text-xs text-muted-foreground">{t.network.chooserHint}</p>
        </section>
      )}
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <StatusBadge status={server.status} />
        <p className="text-sm text-muted-foreground">{d.statusLine[server.status]}</p>
        {server.status === 'installing' && task && (
          <div className="space-y-1.5 pt-1">
            <TaskProgress value={task.progress} />
            <p className="text-xs text-muted-foreground">
              {task.step ?? t.tasks.working}
              {task.detail ? ` · ${task.detail}` : ''}
            </p>
          </div>
        )}
      </section>
      <JoinCard server={server} />
      {server.status === 'running' && <UsageCard server={server} />}
      {server.status === 'running' && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold">
            {d.playersOnline} · {t.servers.players(server.players.length, server.maxPlayers)}
          </h3>
          {server.players.length === 0 ? (
            <p className="text-sm text-muted-foreground">{d.nobodyOnline}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {server.players.map((p) => (
                <li key={p} className="flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2.5 font-mono text-sm">
                  {p}
                  <PlayerMenu serverId={server.config.id} name={p} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

export function ServerPage({ id }: { id: string }) {
  const server = useServer(id)
  const go = useNav((s) => s.go)
  const advanced = useIsAdvanced()
  const [tab, setTab] = useState('overview')
  // The Files tab only exists in Advanced; don't leave the page on a missing tab.
  useEffect(() => {
    if (!advanced && tab === 'files') setTab('overview')
  }, [advanced, tab])
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!server) {
    return (
      <Button variant="ghost" onClick={() => go('servers')}>
        <ArrowLeft />
        {d.back}
      </Button>
    )
  }
  const c = server.config
  const live = server.status === 'running' || server.status === 'starting' || server.status === 'stopping'

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <button
            type="button"
            onClick={() => go('servers')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {d.back}
          </button>
          <div className="flex items-center gap-3">
            <h2 className="truncate text-2xl font-semibold tracking-tight">{c.name}</h2>
            <StatusBadge status={server.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Minecraft {c.mcVersion} · {LOADER_LABELS[c.loader]}
            {c.loaderVersion && c.loader !== 'vanilla' ? ` ${c.loaderVersion}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {c.installed && <ShareButton server={server} />}
          <PowerButtons server={server} showRestart />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void attempt(() => api.servers.openFolder(c.id))}>
                <FolderOpen />
                {d.openFolder}
              </DropdownMenuItem>
              {!c.installed && server.status !== 'installing' && (
                <DropdownMenuItem onClick={() => void attempt(() => api.servers.retryInstall(c.id))}>
                  <RotateCw />
                  {d.retrySetup}
                </DropdownMenuItem>
              )}
              {live && (
                <DropdownMenuItem onClick={() => void attempt(() => api.servers.kill(c.id))}>
                  <Zap />
                  {d.forceStop}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={server.status === 'installing'}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                {d.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {server.problem && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="flex-1">{server.problem}</p>
          {!c.installed && server.status !== 'installing' && (
            <Button size="sm" variant="outline" onClick={() => void attempt(() => api.servers.retryInstall(c.id))}>
              {d.retrySetup}
            </Button>
          )}
        </div>
      )}
      {server.restartNeeded && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
          <RotateCw className="size-4 shrink-0" />
          <p className="flex-1">{d.restartNeeded}</p>
          <Button size="sm" variant="outline" onClick={() => void attempt(() => api.servers.restart(c.id))}>
            {t.servers.restart}
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="overview">{d.tabs.overview}</TabsTrigger>
          <TabsTrigger value="players" disabled={!c.installed}>
            {t.players.tab}
          </TabsTrigger>
          <TabsTrigger value="network" disabled={!c.installed}>
            {t.network.tab}
          </TabsTrigger>
          <TabsTrigger value="worlds" disabled={!c.installed}>
            {t.worlds.tab}
          </TabsTrigger>
          <TabsTrigger value="backups" disabled={!c.installed}>
            {t.backups.tab}
          </TabsTrigger>
          <TabsTrigger value="console">{d.tabs.console}</TabsTrigger>
          <TabsTrigger value="settings" disabled={server.status === 'installing'}>
            {d.tabs.settings}
          </TabsTrigger>
          {advanced && (
            <TabsTrigger value="files" disabled={server.status === 'installing'}>
              {t.files.tab}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="overview" className="pt-2">
          <Overview server={server} />
        </TabsContent>
        <TabsContent value="network" className="pt-2">
          <NetworkPanel server={server} />
        </TabsContent>
        <TabsContent value="worlds" className="pt-2">
          <WorldsPanel server={server} />
        </TabsContent>
        <TabsContent value="backups" className="pt-2">
          <BackupsPanel server={server} />
        </TabsContent>
        <TabsContent value="console" className="min-h-[24rem] flex-1 pt-2">
          <ConsoleView server={server} />
        </TabsContent>
        <TabsContent value="settings" className="pt-2">
          <ServerSettingsPanel server={server} />
        </TabsContent>
        <TabsContent value="players" className="pt-2">
          <PlayersPanel server={server} />
        </TabsContent>
        {advanced && (
          <TabsContent value="files" className="pt-2">
            <FilesPanel server={server} />
          </TabsContent>
        )}
      </Tabs>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{d.deleteTitle(c.name)}</AlertDialogTitle>
            <AlertDialogDescription>{d.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.create.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                void attempt(async () => {
                  await api.servers.remove(c.id)
                  go('servers')
                })
              }
            >
              {d.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
