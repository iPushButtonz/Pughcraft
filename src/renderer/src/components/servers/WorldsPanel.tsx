import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Download, Globe2, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { WorldInfo } from '@shared/imports'
import type { ServerSummary } from '@shared/servers'
import { formatBytes } from '@shared/format'
import { Button } from '@/components/ui/button'
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
import { ImportDialog } from '@/components/imports/ImportDialog'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { timeAgo } from '@/lib/time'
import { t } from '@/strings'

const w = t.worlds

export function WorldsPanel({ server }: { server: ServerSummary }) {
  const id = server.config.id
  const [worlds, setWorlds] = useState<WorldInfo[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<WorldInfo | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSeed, setNewSeed] = useState('')
  const stopped = server.status === 'stopped' || server.status === 'crashed'

  const load = useCallback(() => api.worlds.list(id).then(setWorlds), [id])
  useEffect(() => {
    void load()
    return api.worlds.onChanged((changed) => changed === id && void load())
  }, [id, load])
  // A first start creates the world; refresh when the status changes.
  useEffect(() => void load(), [server.status, load])

  const act = (fn: () => Promise<void>) => async () => {
    try {
      await fn()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={!stopped} title={stopped ? undefined : w.stopFirst} onClick={() => setCreating(true)}>
          <Sparkles />
          {w.newWorld}
        </Button>
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus />
          {w.add}
        </Button>
      </div>
      {worlds && worlds.length === 0 && <p className="text-sm text-muted-foreground">{w.none}</p>}
      <ul className="space-y-2">
        {worlds?.map((world) => (
          <li key={world.slot} className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
            <div className="flex min-w-0 items-center gap-3">
              <Globe2 className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-medium">
                  {world.levelName}
                  {world.active && (
                    <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                      <CheckCircle2 className="size-3" />
                      {w.active}
                    </span>
                  )}
                  {world.pending && <span className="rounded bg-warning/20 px-1.5 py-0.5 text-xs font-normal">{w.pending}</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[
                    world.mcVersion ? w.version(world.mcVersion) : null,
                    formatBytes(world.sizeBytes),
                    world.lastPlayed ? w.lastPlayed(timeAgo(world.lastPlayed)) : null
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!world.pending && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={w.exportZip}
                  title={w.exportZip}
                  onClick={act(async () => {
                    if (await api.worlds.exportZip(id, world.slot)) toast.info(w.exporting)
                  })}
                >
                  <Download />
                </Button>
              )}
            {!world.active && (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  disabled={!stopped || switching !== null}
                  title={stopped ? w.switchHint : w.stopFirst}
                  onClick={act(async () => {
                    setSwitching(world.slot)
                    try {
                      await api.worlds.activate(id, world.slot)
                      toast.success(w.switched)
                    } finally {
                      setSwitching(null)
                    }
                  })}
                >
                  {switching === world.slot && <Loader2 className="animate-spin" />}
                  {switching === world.slot ? w.switching : w.activate}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={w.delete} onClick={() => setDeleting(world)}>
                  <Trash2 />
                </Button>
              </div>
            )}
            </div>
          </li>
        ))}
      </ul>
      {!stopped && worlds && worlds.length > 1 && <p className="text-xs text-muted-foreground">{w.stopFirst}</p>}

      <ImportDialog open={adding} onOpenChange={setAdding} targetServerId={id} />
      <Dialog open={creating} onOpenChange={(o) => !busy && setCreating(o)}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!newName.trim()) return
              setBusy(true)
              void act(async () => {
                try {
                  await api.worlds.create(id, newName.trim(), newSeed.trim())
                  toast.success(w.created)
                  setCreating(false)
                  setNewName('')
                  setNewSeed('')
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            <DialogHeader>
              <DialogTitle>{w.newWorldTitle}</DialogTitle>
              <DialogDescription>{w.newWorldBody}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="new-world-name">{w.newWorldName}</Label>
              <Input id="new-world-name" autoFocus maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-world-seed">{w.newWorldSeed}</Label>
              <Input id="new-world-seed" maxLength={64} placeholder={w.newWorldSeedHint} value={newSeed} onChange={(e) => setNewSeed(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setCreating(false)}>
                {t.create.cancel}
              </Button>
              <Button type="submit" disabled={busy || !newName.trim()}>
                {busy && <Loader2 className="animate-spin" />}
                {busy ? w.creating : w.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting && w.deleteTitle(deleting.levelName)}</AlertDialogTitle>
            <AlertDialogDescription>{w.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.create.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={act(async () => {
                if (deleting) await api.worlds.remove(id, deleting.slot)
                setDeleting(null)
              })}
            >
              {w.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
