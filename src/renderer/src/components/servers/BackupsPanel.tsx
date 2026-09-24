import { useCallback, useEffect, useState } from 'react'
import { Archive, FolderOpen, Hand, Loader2, Lock, MoreHorizontal, RotateCcw, ShieldCheck, Timer, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BackupInfo, BackupKind, BackupsView, RestoreMode } from '@shared/backups'
import type { ServerSummary } from '@shared/servers'
import { formatBytes } from '@shared/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { SettingRow, SettingSection } from '@/components/SettingRow'
import { useIsAdvanced } from '@/stores/settings'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { timeAgo } from '@/lib/time'
import { t } from '@/strings'

const b = t.backups
const KEEP_CHOICES = [3, 5, 10, 20, 50]
const KIND_ICONS: Record<BackupKind, typeof Timer> = { auto: Timer, manual: Hand, safety: ShieldCheck }

async function attempt<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action()
  } catch (err) {
    toast.error(errorMessage(err))
    return undefined
  }
}

const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Minutes between backups, typed by hand in Advanced. Empty turns timed backups off. */
function IntervalInput({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  useEffect(() => setDraft(value === null ? '' : String(value)), [value])
  const commit = (): void => {
    const text = draft.trim()
    const next = text === '' ? null : Number(text)
    if (next !== null && !Number.isFinite(next)) return setDraft(value === null ? '' : String(value))
    if (next !== value) onCommit(next)
  }
  return (
    <Input
      className="w-24"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function RestoreDialog({
  server,
  backup,
  onClose
}: {
  server: ServerSummary
  backup: BackupInfo | null
  onClose: () => void
}) {
  const [mode, setMode] = useState<RestoreMode>('server')
  const [order, setOrder] = useState<string[] | null>(null)
  useEffect(() => {
    if (!backup) return
    setMode('server')
    void api.catalog
      .mcVersions()
      .then((r) => setOrder(r.versions.map((v) => v.id)))
      .catch(() => setOrder(null))
  }, [backup])
  if (!backup) return null
  const now = server.config.mcVersion
  const then = backup.mcVersion
  const differs = then !== now
  // The version list is newest first: a smaller index means newer.
  const worldIsNewer = differs && !!order && order.includes(then) && order.includes(now) && order.indexOf(then) < order.indexOf(now)

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{b.restoreTitle(when(backup.createdAt))}</AlertDialogTitle>
          <AlertDialogDescription>{b.restoreSafety}</AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as RestoreMode)} className="gap-3">
          {(['server', 'world'] as const).map((m) => (
            <div key={m} className="flex items-start gap-3">
              <RadioGroupItem value={m} id={`restore-${m}`} className="mt-0.5" />
              <Label htmlFor={`restore-${m}`} className="flex-col items-start gap-1 leading-snug font-normal">
                <span className="font-medium">{m === 'server' ? b.restoreServer : b.restoreWorld}</span>
                <span className="text-muted-foreground">{m === 'server' ? b.restoreServerHint : b.restoreWorldHint}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        {differs && mode === 'server' && <p className="text-sm text-muted-foreground">{b.restoreVersionNote(then, now)}</p>}
        {worldIsNewer && mode === 'world' && (
          <p className="rounded-md border border-warning/50 bg-warning/10 p-2 text-sm">{b.restoreWorldNewer(then, now)}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t.create.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              void attempt(async () => {
                await api.backups.restore(server.config.id, backup.id, mode)
                toast.info(b.restoring)
              })
            }
          >
            {b.restoreConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function BackupRow({
  backup,
  canRestore,
  onRestore,
  onDelete,
  serverId
}: {
  backup: BackupInfo
  canRestore: boolean
  onRestore: () => void
  onDelete: () => void
  serverId: string
}) {
  const Icon = KIND_ICONS[backup.kind]
  const details = [
    backup.worldName ? b.world(backup.worldName) : null,
    b.version(backup.mcVersion),
    b.size(formatBytes(backup.totalBytes), formatBytes(backup.newBytes))
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span title={timeAgo(backup.createdAt)}>{when(backup.createdAt)}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground" title={b.kindHints[backup.kind]}>
              {b.kinds[backup.kind]}
            </span>
            {backup.protected && (
              <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-normal text-primary">
                <Lock className="size-3" />
                {b.protected}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {/* "Made by you" already says why a manual backup exists. */}
            {backup.kind === 'manual' ? details : `${backup.reason} · ${details}`}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="outline" disabled={!canRestore} title={canRestore ? undefined : b.stopFirst} onClick={onRestore}>
          <RotateCcw />
          {b.restore}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="More">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void attempt(() => api.backups.setProtected(serverId, backup.id, !backup.protected))}>
              <Lock />
              {backup.protected ? b.unprotect : b.protect}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void attempt(async () => {
                  if (await api.backups.exportZip(serverId, backup.id)) toast.info(b.exporting)
                })
              }
            >
              <Archive />
              {b.exportZip}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              {b.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

export function BackupsPanel({ server }: { server: ServerSummary }) {
  const id = server.config.id
  const advanced = useIsAdvanced()
  const [view, setView] = useState<BackupsView | null>(null)
  const [restoring, setRestoring] = useState<BackupInfo | null>(null)
  const [deleting, setDeleting] = useState<BackupInfo | null>(null)
  const stopped = server.status === 'stopped' || server.status === 'crashed'

  const load = useCallback(() => api.backups.view(id).then(setView).catch(() => undefined), [id])
  useEffect(() => {
    void load()
    return api.backups.onChanged((changed) => changed === id && void load())
  }, [id, load])

  if (!view) return null
  const s = view.schedule
  const latest = view.backups[0]

  const setSchedule = (patch: Parameters<typeof api.backups.setSchedule>[1]): void => {
    setView({ ...view, schedule: { ...s, ...patch } })
    void attempt(async () => {
      if (await api.backups.setSchedule(id, patch)) toast.info(b.moving)
    }).then(() => load())
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5">
        <div className="space-y-0.5">
          <p className="font-medium">{latest ? b.lastBackup(timeAgo(latest.createdAt)) : b.noneYet}</p>
          <p className="text-sm text-muted-foreground">{b.diskUse(formatBytes(view.diskBytes))}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void attempt(() => api.backups.openFolder(id))}>
            <FolderOpen />
            {b.openFolder}
          </Button>
          <Button
            disabled={view.running}
            onClick={() =>
              void attempt(async () => {
                await api.backups.backupNow(id)
                if (server.status === 'running') toast.info(b.startedLive)
              })
            }
          >
            {view.running ? <Loader2 className="animate-spin" /> : <Archive />}
            {view.running ? b.backingUp : b.backUpNow}
          </Button>
        </div>
      </div>

      <SettingSection title={b.whenTitle}>
        <SettingRow label={b.interval(s.intervalMinutes ?? 30)} hint={b.intervalHint}>
          <Switch
            checked={s.intervalMinutes !== null}
            onCheckedChange={(on) => setSchedule({ intervalMinutes: on ? 30 : null })}
          />
        </SettingRow>
        <SettingRow label={b.onStop} hint={b.onStopHint}>
          <Switch checked={s.onStop} onCheckedChange={(on) => setSchedule({ onStop: on })} />
        </SettingRow>
        <SettingRow label={b.keep} hint={b.keepHint}>
          <Select value={String(s.keep)} onValueChange={(v) => setSchedule({ keep: Number(v) })}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([...KEEP_CHOICES, s.keep])]
                .sort((x, y) => x - y)
                .map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <p className="py-3 text-sm text-muted-foreground">{b.manualHint}</p>
      </SettingSection>

      {advanced && (
        <SettingSection title={b.advancedTitle}>
          <SettingRow label={b.intervalExact} hint={b.intervalExactHint}>
            <IntervalInput value={s.intervalMinutes} onCommit={(v) => setSchedule({ intervalMinutes: v })} />
          </SettingRow>
          <SettingRow label={b.location} hint={b.locationHint} stacked>
            <div className="flex items-center gap-2">
              <code data-selectable className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
                {view.location}
              </code>
              {s.location && (
                <Button size="sm" variant="outline" disabled={view.running} onClick={() => setSchedule({ location: null })}>
                  {b.useDefault}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={view.running}
                onClick={() =>
                  void attempt(async () => {
                    const dir = await api.backups.pickLocation()
                    if (dir) setSchedule({ location: dir })
                  })
                }
              >
                {b.change}
              </Button>
            </div>
          </SettingRow>
        </SettingSection>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{b.listTitle}</h2>
        {view.backups.length === 0 && <p className="text-sm text-muted-foreground">{b.empty}</p>}
        <ul className="space-y-2">
          {view.backups.map((backup) => (
            <BackupRow
              key={backup.id}
              backup={backup}
              serverId={id}
              canRestore={stopped && !view.running}
              onRestore={() => setRestoring(backup)}
              onDelete={() => setDeleting(backup)}
            />
          ))}
        </ul>
        {!stopped && view.backups.length > 0 && <p className="text-xs text-muted-foreground">{b.stopFirst}</p>}
      </section>

      <RestoreDialog server={server} backup={restoring} onClose={() => setRestoring(null)} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{b.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{deleting?.protected ? b.deleteProtectedBody : b.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.create.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                void attempt(async () => {
                  if (deleting) await api.backups.delete(id, deleting.id)
                  setDeleting(null)
                })
              }
            >
              {b.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
