import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, FileArchive, FolderOpen, ImagePlus, Loader2, Upload, XCircle } from 'lucide-react'
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
import { setDropTarget } from '@/lib/dropTarget'
import { errorMessage } from '@/lib/errors'
import { BEST_MAX_MB, BEST_MIN_MB, memoryTier } from '@/lib/memoryAdvice'
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
  const [phase, setPhase] = useState<'choose' | 'review'>('choose')
  const [found, setFound] = useState<FoundItem[] | null>(null)
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  // Bumped whenever an analysis is abandoned, so a late result is thrown away.
  const attempt = useRef(0)

  /** Goes straight to the settings wizard; the files are checked in the background. */
  const analyze = (path: string): void => {
    const mine = ++attempt.current
    setAnalysis(null)
    setPhase('review')
    api.imports.analyze(path).then(
      (result) => {
        if (attempt.current === mine) setAnalysis(result)
        else void api.imports.discard(result.id)
      },
      (err) => {
        if (attempt.current !== mine) return
        toast.error(errorMessage(err))
        setPhase('choose')
      }
    )
  }

  // While this screen is open, a file dropped anywhere on the window is checked here.
  const analyzeRef = useRef(analyze)
  analyzeRef.current = analyze
  useEffect(() => {
    if (!open) return
    return setDropTarget((paths) => analyzeRef.current(paths[0]))
  }, [open])

  useEffect(() => {
    if (!open) return
    attempt.current++
    setPhase('choose')
    setAnalysis(null)
    setFound(null)
    void api.imports.scan().then(setFound, () => setFound([]))
    if (initialPath) analyze(initialPath)
  }, [open, initialPath])

  const close = (next: boolean): void => {
    if (!next) {
      attempt.current++
      if (analysis) void api.imports.discard(analysis.id)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{phase === 'review' ? m.settingsTitle : m.title}</DialogTitle>
          <DialogDescription className="sr-only">{m.title}</DialogDescription>
        </DialogHeader>

        {phase === 'choose' && (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border p-8 text-center">
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

        {phase === 'review' && (
          <Review
            analysis={analysis}
            targetServerId={targetServerId ?? null}
            onBack={() => {
              attempt.current++
              if (analysis) void api.imports.discard(analysis.id)
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
  /** Null while the files are still being checked in the background. */
  analysis: ImportAnalysis | null
  targetServerId: string | null
  onBack: () => void
  onDone: () => void
}) {
  const advanced = useIsAdvanced()
  const eulaAcceptedAt = useSettings((s) => s.settings?.eulaAcceptedAt ?? null)
  const serversMap = useServers((s) => s.servers)
  const servers = useMemo(() => Object.values(serversMap), [serversMap])
  const openServer = useNav((s) => s.openServer)

  const SUMMARY = 3
  const [step, setStep] = useState(targetServerId ? SUMMARY : 0)
  const [versions, setVersions] = useState<McVersionInfo[]>([])
  const [latest, setLatest] = useState('')
  const [memory, setMemory] = useState<MemoryInfo | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [mcVersion, setMcVersion] = useState('')
  const [loader, setLoader] = useState<LoaderChoice>('vanilla')
  const [memoryMb, setMemoryMb] = useState(3072)
  const [target, setTarget] = useState<'new' | 'existing'>(targetServerId ? 'existing' : 'new')
  const [serverId, setServerId] = useState<string>(targetServerId ?? '')
  const [leaveOut, setLeaveOut] = useState(true)
  const [showMods, setShowMods] = useState(false)
  const [worldFolder, setWorldFolder] = useState<string>('')
  const [eula, setEula] = useState(false)
  const [busy, setBusy] = useState(false)
  // Fields the person has edited; the detected values never overwrite these.
  const touched = useRef(new Set<string>())
  const touch = (key: string): void => void touched.current.add(key)

  useEffect(() => {
    void api.catalog.mcVersions().then(({ versions: v, latest: l }) => {
      setVersions(v.filter((x) => x.type === 'release'))
      setLatest(l)
    })
    void api.catalog.memory().then(setMemory)
  }, [])

  // Fill in what was detected once the files have been checked.
  useEffect(() => {
    if (!a) return
    if (!touched.current.has('name')) setName(a.name)
    if (!touched.current.has('mcVersion')) setMcVersion(a.mcVersion ?? latest)
    if (!touched.current.has('loader')) setLoader((a.loader as LoaderChoice) ?? 'vanilla')
    if (!touched.current.has('memory') && memory) setMemoryMb(suggestedMemory(a, memory))
  }, [a, latest, memory])

  const clientMods = a ? a.mods.filter((x) => x.side === 'client').length : 0
  const loaderChanged = !!a && (loader !== a.loader || mcVersion !== a.mcVersion)
  const needsEula = !eulaAcceptedAt && target === 'new'
  const targetServer = servers.find((s) => s.config.id === serverId)
  const blocked = !!a && a.problems.length > 0
  // Versions are listed newest first, so a lower index means newer.
  const age = (v: string | null | undefined): number => (v ? versions.findIndex((x) => x.id === v) : -1)
  const worldTooNew =
    !!a && target === 'existing' && !!targetServer && !!a.mcVersion && age(a.mcVersion) >= 0 && age(targetServer.config.mcVersion) >= 0 &&
    age(a.mcVersion) < age(targetServer.config.mcVersion)
  const canImport =
    !!a && !blocked && !busy && !!mcVersion && !!name.trim() && !worldTooNew &&
    (target === 'new' ? !needsEula || eula : !!serverId)
  const wizard = target === 'new' && !blocked && step < SUMMARY
  const hasSettings = !!a && !!a.mcVersion && !!a.loader

  const run = async (): Promise<void> => {
    if (!a) return
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
        acceptEula: needsEula ? eula : false,
        iconDataUrl: icon
      })
      onDone()
      openServer(res.serverId)
      if (target === 'existing') toast.success(m.addedWorld)
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(false)
    }
  }

  const pickIcon = (): void => {
    void api.imports.pickIcon().then(
      (p) => { if (p) setIcon(p.dataUrl) },
      (err) => toast.error(errorMessage(err))
    )
  }

  const versionOptions = versions.some((v) => v.id === mcVersion) || !mcVersion ? versions : [{ id: mcVersion, type: 'release' as const, releaseTime: '' }, ...versions]

  const nameStep = (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="import-name">{m.serverName}</Label>
        <Input id="import-name" value={name} maxLength={40} onChange={(e) => { touch('name'); setName(e.target.value) }} />
        <p className="text-xs text-muted-foreground">{m.serverNameHint}</p>
      </div>
      <div className="space-y-2">
        <Label>{m.icon}</Label>
        <div className="flex items-center gap-4">
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
            {icon ? <img src={icon} alt="" className="size-16 [image-rendering:pixelated]" /> : <ImagePlus className="size-6 text-muted-foreground" />}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={pickIcon}>
              {icon ? m.iconChange : m.iconChoose}
            </Button>
            {icon && (
              <Button variant="ghost" onClick={() => setIcon(null)}>
                {m.iconRemove}
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{m.iconHint}</p>
      </div>
    </div>
  )

  const versionStep = (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>{t.create.version}</Label>
        <Select value={mcVersion} onValueChange={(v) => { touch('mcVersion'); setMcVersion(v) }}>
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
        <Select value={loader} onValueChange={(v) => { touch('loader'); setLoader(v as LoaderChoice) }}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(a?.loader === 'custom' ? [...LOADER_CHOICES, 'custom' as LoaderChoice] : LOADER_CHOICES).map((l) => (
              <SelectItem key={l} value={l}>
                {LOADER_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  const memoryStep = memory && (
    <div className="space-y-3">
      <Label>
        {t.create.memory}: {advanced ? `${memoryMb} MB` : gb(memoryMb)}
      </Label>
      <div className="relative">
        <Slider
          min={1024}
          max={memory.maxMb}
          step={512}
          value={[memoryMb]}
          onValueChange={([v]) => { touch('memory'); setMemoryMb(v) }}
        />
        {memory.maxMb > BEST_MIN_MB && (
          <div
            className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary/25"
            style={{
              left: `${((BEST_MIN_MB - 1024) / (memory.maxMb - 1024)) * 100}%`,
              width: `${((Math.min(BEST_MAX_MB, memory.maxMb) - BEST_MIN_MB) / (memory.maxMb - 1024)) * 100}%`
            }}
          />
        )}
      </div>
      <p className={cn('rounded-lg border p-3 text-sm', memoryTier(memoryMb) === 'best' ? 'border-primary/50 bg-primary/10' : memoryTier(memoryMb) === 'tooLow' ? 'border-destructive/40 bg-destructive/10' : 'bg-muted/30')}>
        {m.memoryTiers[memoryTier(memoryMb)]}
      </p>
      <p className="text-xs text-muted-foreground">{m.memoryPc(gb(memory.totalMb))}</p>
    </div>
  )

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {wizard && (
          <p className="text-xs font-medium text-muted-foreground">
            {m.step(step + 1, SUMMARY + 1)}: {m.stepNames[step]}
          </p>
        )}

        {!a ? (
          <p className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            {m.settingsPending}
          </p>
        ) : (
          <>
            {a.problems.map((p) => (
              <div key={p} className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p>{p}</p>
              </div>
            ))}
            {!blocked && (
              <p className={cn('rounded-lg border p-3 text-sm', hasSettings ? 'bg-muted/30' : 'border-warning/50 bg-warning/10')}>
                {hasSettings ? m.settingsFound : m.settingsMissing}
              </p>
            )}
            {a.warnings.map((w) => (
              <div key={w} className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>{w}</p>
              </div>
            ))}
          </>
        )}

        {wizard && step === 0 && nameStep}
        {wizard && step === 1 && versionStep}
        {wizard && step === 2 && memoryStep}

        {step === SUMMARY && a && !blocked && (
          <>
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
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border p-3 text-sm">
                  <dt className="text-muted-foreground">{m.serverName}</dt>
                  <dd className="truncate">{name}</dd>
                  <dt className="text-muted-foreground">{t.create.version}</dt>
                  <dd>{mcVersion}</dd>
                  <dt className="text-muted-foreground">{t.create.type}</dt>
                  <dd>{LOADER_LABELS[loader]}</dd>
                  <dt className="text-muted-foreground">{t.create.memory}</dt>
                  <dd>{advanced ? `${memoryMb} MB` : gb(memoryMb)}</dd>
                </dl>

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

        {step === SUMMARY && !a && <p className="text-sm text-muted-foreground">{m.waiting}</p>}
      </div>
      <DialogFooter className="border-t px-6 py-4 sm:justify-between">
        <Button variant="ghost" onClick={step > 0 && !targetServerId ? () => setStep(step - 1) : onBack}>
          <ArrowLeft />
          {m.back}
        </Button>
        {wizard ? (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(SUMMARY)}>
              {m.skip}
            </Button>
            <Button onClick={() => setStep(step + 1)}>{m.next}</Button>
          </div>
        ) : (
          <Button onClick={() => void run()} disabled={!canImport}>
            {(busy || !a) && <Loader2 className="animate-spin" />}
            {busy ? m.importing : !a ? m.waiting : m.import}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}
