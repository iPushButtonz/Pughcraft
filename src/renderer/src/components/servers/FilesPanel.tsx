import { useCallback, useEffect, useState } from 'react'
import { ArrowUp, File, FilePlus, Folder, FolderOpen, FolderPlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { FileContent, FileEntry } from '@shared/players'
import type { ServerSummary } from '@shared/servers'
import { formatBytes } from '@shared/format'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
import { PromptDialog } from '@/components/PromptDialog'
import { useSettings } from '@/stores/settings'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { t } from '@/strings'

const f = t.files

async function attempt<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action()
  } catch (err) {
    toast.error(errorMessage(err))
    return undefined
  }
}

const parentOf = (path: string): string => path.split('/').slice(0, -1).join('/')

/** Advanced: browse and edit the real files in the server folder. */
export function FilesPanel({ server }: { server: ServerSummary }) {
  const id = server.config.id
  const live = server.status !== 'stopped' && server.status !== 'crashed' && server.status !== 'installing'
  const editWhileRunning = useSettings((s) => s.settings?.editFilesWhileRunning ?? true)
  const readOnly = live && !editWhileRunning
  const [dir, setDir] = useState('')
  const [entries, setEntries] = useState<FileEntry[] | null>(null)
  const [open, setOpen] = useState<FileContent | null>(null)
  const [draft, setDraft] = useState('')
  const [prompt, setPrompt] = useState<{ kind: 'mkdir' } | { kind: 'rename'; entry: FileEntry } | null>(null)
  const [deleting, setDeleting] = useState<FileEntry | null>(null)

  const load = useCallback(
    () =>
      api.files
        .list(id, dir)
        .then(setEntries)
        .catch((err) => {
          toast.error(errorMessage(err))
          setEntries([])
        }),
    [id, dir]
  )
  useEffect(() => void load(), [load])

  const openFile = async (entry: FileEntry): Promise<void> => {
    if (entry.dir) {
      setDir(entry.path)
      return
    }
    const content = await attempt(() => api.files.read(id, entry.path))
    if (!content) return
    setOpen(content)
    setDraft(content.text ?? '')
  }

  const dirty = open?.text !== null && open?.text !== undefined && draft !== open.text
  const crumbs = dir ? dir.split('/') : []

  return (
    <div className="grid min-h-[32rem] gap-4 pb-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className="flex min-h-0 flex-col rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-1 border-b p-2">
          <Button size="icon-sm" variant="ghost" aria-label={f.up} disabled={!dir} onClick={() => setDir(parentOf(dir))}>
            <ArrowUp />
          </Button>
          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
            <button type="button" className="hover:underline" onClick={() => setDir('')}>
              {f.root}
            </button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="text-muted-foreground">/</span>
                <button type="button" className="truncate hover:underline" onClick={() => setDir(crumbs.slice(0, i + 1).join('/'))}>
                  {c}
                </button>
              </span>
            ))}
          </nav>
          <Button size="icon-sm" variant="ghost" aria-label={f.newFolder} title={f.newFolder} disabled={readOnly} onClick={() => setPrompt({ kind: 'mkdir' })}>
            <FolderPlus />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={f.addFiles}
            title={f.addFiles}
            disabled={readOnly}
            onClick={() => void attempt(() => api.files.importFiles(id, dir)).then(() => setTimeout(() => void load(), 800))}
          >
            <FilePlus />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={f.openFolder} title={f.openFolder} onClick={() => void attempt(() => api.files.reveal(id, dir))}>
            <FolderOpen />
          </Button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-1">
          {entries?.length === 0 && <li className="p-3 text-sm text-muted-foreground">{f.empty}</li>}
          {entries?.map((e) => (
            <li
              key={e.path}
              className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60 ${open?.path === e.path ? 'bg-muted' : ''}`}
            >
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => void openFile(e)}>
                {e.dir ? <Folder className="size-4 shrink-0 text-primary" /> : <File className="size-4 shrink-0 text-muted-foreground" />}
                <span className="truncate">{e.name}</span>
              </button>
              {!e.dir && <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(e.size)}</span>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={e.name} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={readOnly} onClick={() => setPrompt({ kind: 'rename', entry: e })}>
                    <Pencil />
                    {f.rename}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void attempt(() => api.files.reveal(id, e.path))}>
                    <FolderOpen />
                    {f.openFolder}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" disabled={readOnly} onClick={() => setDeleting(e)}>
                    <Trash2 />
                    {f.delete}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex min-h-0 flex-col rounded-xl border bg-card">
        {!open ? (
          <p className="p-5 text-sm text-muted-foreground">{f.pick}</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm">{open.path}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(open.size)}
                  {dirty ? ` · ${f.unsaved}` : ''}
                </p>
              </div>
              {open.text !== null && (
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" disabled={!dirty} onClick={() => setDraft(open.text ?? '')}>
                    {f.revert}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!dirty || readOnly}
                    onClick={() =>
                      void attempt(async () => {
                        await api.files.write(id, open.path, draft)
                        setOpen({ ...open, text: draft, size: new TextEncoder().encode(draft).length })
                        toast.success(live ? f.savedRunning : f.saved)
                        void load()
                      })
                    }
                  >
                    {f.save}
                  </Button>
                </div>
              )}
            </div>
            {live && <p className="border-b bg-warning/10 px-4 py-2 text-xs">{readOnly ? f.readOnlyRunning : f.runningWarning}</p>}
            {open.text === null ? (
              <p className="p-5 text-sm text-muted-foreground">{open.reason}</p>
            ) : (
              <Textarea
                data-selectable
                spellCheck={false}
                readOnly={readOnly}
                className="min-h-[28rem] flex-1 resize-none rounded-none border-0 font-mono text-xs focus-visible:ring-0"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </>
        )}
      </section>

      <PromptDialog
        open={prompt !== null}
        title={prompt?.kind === 'rename' ? f.rename : f.newFolder}
        label={prompt?.kind === 'rename' ? f.rename : f.newFolderName}
        initial={prompt?.kind === 'rename' ? prompt.entry.name : ''}
        confirm={prompt?.kind === 'rename' ? f.rename : f.newFolder}
        onClose={() => setPrompt(null)}
        onSubmit={(value) =>
          void attempt(async () => {
            if (prompt?.kind === 'rename') {
              await api.files.rename(id, prompt.entry.path, value)
              if (open?.path === prompt.entry.path) setOpen(null)
            } else await api.files.mkdir(id, dir, value)
            await load()
          })
        }
      />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting && f.deleteTitle(deleting.name)}</AlertDialogTitle>
            <AlertDialogDescription>{f.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.create.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                void attempt(async () => {
                  if (!deleting) return
                  await api.files.trash(id, deleting.path)
                  if (open?.path === deleting.path) setOpen(null)
                  setDeleting(null)
                  await load()
                })
              }
            >
              {f.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
