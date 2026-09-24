import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Globe2, Plus, Trash2 } from 'lucide-react'
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
      <div className="flex justify-end">
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
            {!world.active && (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  disabled={!stopped}
                  title={stopped ? undefined : w.stopFirst}
                  onClick={act(() => api.worlds.activate(id, world.slot))}
                >
                  {w.activate}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={w.delete} onClick={() => setDeleting(world)}>
                  <Trash2 />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!stopped && worlds && worlds.length > 1 && <p className="text-xs text-muted-foreground">{w.stopFirst}</p>}

      <ImportDialog open={adding} onOpenChange={setAdding} targetServerId={id} />
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
