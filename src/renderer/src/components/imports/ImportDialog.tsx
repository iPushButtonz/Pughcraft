import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, FileArchive, FolderOpen, Loader2, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import type { FoundItem, ImportAnalysis } from '@shared/imports'
import { LOADER_LABELS, type McVersionInfo, type MemoryInfo } from '@shared/servers'
import { formatBytes } from '@shared/format'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useIsAdvanced, useSettings } from '@/stores/settings'
import { useServers } from '@/stores/servers'
import { useNav } from '@/stores/nav'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { timeAgo } from '@/lib/time'
import { t } from '@/strings'

const m = t.imports
type LoaderChoice = ImportAnalysis['loader'] & string
const LOADER_CHOICES: LoaderChoice[] = ['vanilla', 'paper', 'fabric', 'forge', 'neoforge']
const gb = (mb: number): string => `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`

function suggestedMemory(a: ImportAnalysis, mem: MemoryInfo): number {
  const kept = a.mods.filter((x) => x.side !== 'client').length
  const want = a.loader === 'vanilla' || a.loader === 'paper' ? 3072 : kept < 50 ? 4096 : kept <= 150 ? 6144 : 8192
  return Math.min(want, mem.maxMb)
}

/** Drop zone + pickers + "found on this PC", then a review screen, then import. */
export function ImportDialog({
  open,
  onOpenChange,
  initialPath,
  targetServerId
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A path dropped onto the window before the dialog opened. */
  initialPath?: string | null
  /** Opened from a server's Worlds tab: add the world to this server. */
  targetServerId?: string | null
}) {
  const [phase, setPhase] = useState<'choose' | 'checking' | 'review'>('choose')
  const [checkingLabel, setCheckingLabel] = useState('')
  const [found, setFound] = useState<FoundItem[] | null>(null)
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const [dragging, setDragging] = useState(false)

  const analyze = async (path: string): Promise<void> => {
    setCheckingLabel(path.split(/[\\/]/).pop() ?? path)
    setPhase('checking')
    try {
      setAnalysis(await api.imports.analyze(path))
      setPhase('review')
    } catch (err) {
      toast.error(errorMessage(err))
      setPhase('choose')
    }
  }

  useEffect(() => {
    if (!open) return
    setPhase('choose')
    setAnalysis(null)
    setFound(null)
    void api.imports.scan().then(setFound, () => setFound([]))
    if (initialPath) void analyze(initialPath)
  }, [open, initialPath])

  const close = (next: boolean): void => {
    if (!next && analysis) void api.imports.discard(analysis.id)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{phase === 'review' ? m.reviewTitle : m.title}</DialogTitle>
          <DialogDescription className="sr-only">{m.title}</DialogDescription>
        </DialogHeader>

        {phase === 'choose' && (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const file = e.dataTransfer.files[0]
                if (file) void analyze(api.imports.pathForFile(file))
              }}
              className={cn(
                'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
                dragging ? 'border-primary bg-accent' : 'border-border'
              )}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="font-medium">{m.dropHere}</p>
              <p className="max-w-md text-xs text-muted-foreground">{m.dropHint}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => void api.imports.pick('file').then((p) => { if (p) void analyze(p) })}
                >
                  <FileArchive />
                  {m.chooseFile}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void api.imports.pick('folder').then((p) => { if (p) void analyze(p) })}
                >
                  <FolderOpen />
                  {m.chooseFolder}
                </Button>
              </div>
            </div>

            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold">{m.foundTitle}</h3>
                <p className="text-xs text-muted-foreground">{m.foundHint}</p>
              </div>
              {found === null ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {m.scanning}
                </p>
              ) : found.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.foundNone}</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {found
                    .filter((f) => !targetServerId || f.kind === 'world')
                    .slice(0, 40)
                    .map((f) => (
                      <li key={f.path}>
                        <button
                          type="button"
                          onClick={() => void analyze(f.path)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{f.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {m.kinds[f.kind === 'world' ? 'world' : 'instance']} · {m.launchers[f.launcher]}
                              {f.instance ? ` · ${m.inInstance(f.instance)}` : ''}
                              {f.mcVersion ? ` · ${f.mcVersion}` : ''}
                              {f.loader ? ` ${f.loader}` : ''}
                            </span>
                          </span>
                          {f.lastPlayed && (
                            <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(f.lastPlayed)}</span>
                          )}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {phase === 'checking' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm">{m.checking(checkingLabel)}</p>
          </div>
        )}

        {phase === 'review' && analysis && (
          <Review
            analysis={analysis}
            targetServerId={targetServerId ?? null}
            onBack={() => {
              void api.imports.discard(analysis.id)
              setAnalysis(null)
              setPhase('choose')
            }}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Review({
  analysis: a,
  targetServerId,
  onBack,
  onDone
}: {
  analysis: ImportAnalysis
  targetServerId: string | null
  onBack: () => void
  onDone: () => void
}) {
  const advanced = useIsAdvanced()
  const eulaAcceptedAt = useSettings((s) => s.settings?.eulaAcceptedAt ?? null)
  const serversMap = useServers((s) => s.servers)
  const servers = useMemo(() => Object.values(serversMap), [serversMap])
  const openServer = useNav((s) => s.openServer)

  const [versions, setVersions] = useState<McVersionInfo[]>([])
  const [memory, setMemory] = useState<MemoryInfo | null>(null)
  const [name, setName] = useState(a.name)
  const [mcVersion, setMcVersion] = useState(a.mcVersion ?? '')
  const [loader, setLoader] = useState<LoaderChoice>((a.loader as LoaderChoice) ?? 'vanilla')
  const [memoryMb, setMemoryMb] = useState(3072)
  const [target, setTarget] = useState<'new' | 'existing'>(targetServerId ? 'existing' : 'new')
  const [serverId, setServerId] = useState<string>(targetServerId ?? '')
  const [leaveOut, setLeaveOut] = useState(true)
  const [showMods, setShowMods] = useState(false)
  const [worldFolder, setWorldFolder] = useState<string>('')
  const [eula, setEula] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.catalog.mcVersions().then(({ versions: v, latest }) => {
      setVersions(v.filter((x) => x.type === 'release'))
      if (!a.mcVersion) setMcVersion(latest)
    })
    void api.catalog.memory().then((mem) => {
      setMemory(mem)
      setMemoryMb(suggestedMemory(a, mem))
    })
  }, [a])

  const clientMods = a.mods.filter((x) => x.side === 'client').length
  const loaderChanged = loader !== a.loader || mcVersion !== a.mcVersion
  const needsEula = !eulaAcceptedAt && target === 'new'
  const targetServer = servers.find((s) => s.config.id === serverId)
  const blocked = a.problems.length > 0
  // Versions are listed newest first, so a lower index means newer.
  const age = (v: string | null | undefined): number => (v ? versions.findIndex((x) => x.id === v) : -1)
  const worldTooNew =
    target === 'existing' && !!targetServer && !!a.mcVersion && age(a.mcVersion) >= 0 && age(targetServer.config.mcVersion) >= 0 &&
    age(a.mcVersion) < age(targetServer.config.mcVersion)
  const canImport =
    !blocked && !busy && !!mcVersion && !!name.trim() && !worldTooNew &&
    (target === 'new' ? !needsEula || eula : !!serverId)

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      const res = await api.imports.run({
        analysisId: a.id,
        target: target === 'new' ? { kind: 'new' } : { kind: 'existing', serverId },
        name: name.trim(),
        mcVersion,
        loader,
        loaderVersion: loaderChanged ? null : a.loaderVersion,
        memoryMb,
        removeClientMods: leaveOut,
        worldFolder: worldFolder || null,
        acceptEula: needsEula ? eula : false
      })
      onDone()
      openServer(res.serverId)
      if (target === 'existing') toast.success(m.addedWorld)
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(false)
    }
  }

  const versionOptions = versions.some((v) => v.id === mcVersion) || !mcVersion ? versions : [{ id: mcVersion, type: 'release' as const, releaseTime: '' }, ...versions]

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{m.kinds[a.kind]}</p>
            <p data-selectable className="truncate text-sm font-medium">
              {a.sourceLabel}
            </p>
          </div>
          {a.sizeBytes > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {m.size}: {formatBytes(a.sizeBytes)}
            </span>
          )}
        </div>

        {a.problems.map((p) => (
          <div key={p} className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p>{p}</p>
          </div>
        ))}
        {a.warnings.map((w) => (
          <div key={w} className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{w}</p>
          </div>
        ))}

        {!blocked && (
          <>
            {a.kind === 'world' && (
              <div className="space-y-2">
                <Label>{m.where}</Label>
                <RadioGroup value={target} onValueChange={(v) => setTarget(v as 'new' | 'existing')} className="gap-2">
                  <label className="flex items-center gap-3 text-sm">
                    <RadioGroupItem value="new" />
                    {m.newServer}
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <RadioGroupItem value="existing" disabled={servers.length === 0} />
                    {m.existingServer}
                  </label>
                </RadioGroup>
                {target === 'existing' && (
                  <div className="space-y-2 pl-7">
                    <Select value={serverId} onValueChange={setServerId}>
                      <SelectTrigger className="w-72">
                        <SelectValue placeholder={m.pickServer} />
                      </SelectTrigger>
                      <SelectContent>
                        {servers.map((s) => (
                          <SelectItem key={s.config.id} value={s.config.id}>
                            {s.config.name} · {s.config.mcVersion}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {worldTooNew ? (
                      <p className="text-xs text-destructive">
                        {m.worldTooNew(targetServer!.config.mcVersion, a.mcVersion!)}
                      </p>
                    ) : (
                      targetServer &&
                      a.mcVersion &&
                      targetServer.config.mcVersion !== a.mcVersion && (
                        <p className="text-xs text-muted-foreground">
                          {m.versionMismatch(targetServer.config.mcVersion, a.mcVersion)}
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            {target === 'new' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="import-name">{t.create.name}</Label>
                  <Input id="import-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t.create.version}</Label>
                    <Select value={mcVersion} onValueChange={setMcVersion}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t.create.loading} />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {versionOptions.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t.create.type}</Label>
                    <Select value={loader} onValueChange={(v) => setLoader(v as LoaderChoice)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(a.loader === 'custom' ? [...LOADER_CHOICES, 'custom' as LoaderChoice] : LOADER_CHOICES).map((l) => (
                          <SelectItem key={l} value={l}>
                            {LOADER_LABELS[l]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {a.mods.length > 0 && (
                  <div className="space-y-2 rounded-lg border p-3">
                    <p className="text-sm">{m.mods(a.mods.length, leaveOut ? clientMods : 0, a.duplicateCopies)}</p>
                    {clientMods > 0 && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={leaveOut} onCheckedChange={(v) => setLeaveOut(v === true)} />
                        {m.leaveOut}
                      </label>
                    )}
                    <Button size="xs" variant="ghost" onClick={() => setShowMods((s) => !s)}>
                      {showMods ? m.hideMods : m.showMods}
                    </Button>
                    {showMods && (
                      <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                        {a.mods.map((mod) => (
                          <li key={mod.file} className="flex items-center justify-between gap-2">
                            <span className="truncate">{mod.name}</span>
                            <span
                              className={cn(
                                'shrink-0 rounded px-1.5 py-0.5',
                                mod.side === 'client' ? 'bg-warning/20' : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {m.sides[mod.side]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {a.missingDependencies.length > 0 && (
                      <div className="text-sm">
                        <p className="font-medium">{m.missing}</p>
                        <ul className="list-disc pl-5 text-muted-foreground">
                          {a.missingDependencies.map((d) => (
                            <li key={d.id}>{m.missingItem(d.id, d.requiredBy)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {a.plugins.length > 0 && <p className="text-sm text-muted-foreground">{m.plugins(a.plugins.length)}</p>}

                {a.kind === 'instance' && a.worlds.length > 0 && (
                  <div className="space-y-2">
                    <Label>{m.bringWorld}</Label>
                    <Select value={worldFolder || '__none'} onValueChange={(v) => setWorldFolder(v === '__none' ? '' : v)}>
                      <SelectTrigger className="w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">{m.noWorld}</SelectItem>
                        {a.worlds.map((w) => (
                          <SelectItem key={w.folder} value={w.folder}>
                            {w.levelName} ({w.folder})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {memory && (
                  <div className="space-y-2">
                    <Label>
                      {t.create.memory}: {advanced ? `${memoryMb} MB` : gb(memoryMb)}
                    </Label>
                    <Slider min={1024} max={memory.maxMb} step={512} value={[memoryMb]} onValueChange={([v]) => setMemoryMb(v)} />
                  </div>
                )}

                {needsEula && (
                  <label className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                    <Checkbox checked={eula} onCheckedChange={(v) => setEula(v === true)} className="mt-0.5" />
                    <span>
                      {t.create.eula}{' '}
                      <button
                        type="button"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                        onClick={(e) => {
                          e.preventDefault()
                          void api.app.openExternal('https://aka.ms/MinecraftEULA')
                        }}
                      >
                        {t.create.eulaLink}
                      </button>
                      .
                    </span>
                  </label>
                )}
              </>
            )}
          </>
        )}
      </div>
      <DialogFooter className="border-t px-6 py-4 sm:justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft />
          {m.back}
        </Button>
        <Button onClick={() => void run()} disabled={!canImport}>
          {busy && <Loader2 className="animate-spin" />}
          {busy ? m.importing : m.import}
        </Button>
      </DialogFooter>
    </>
  )
}
