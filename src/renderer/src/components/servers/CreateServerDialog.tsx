import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import {
  LOADER_LABELS,
  type Difficulty,
  type Gamemode,
  type LoaderAvailability,
  type McVersionInfo,
  type MemoryInfo
} from '@shared/servers'
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
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useIsAdvanced, useSettings } from '@/stores/settings'
import { useServers } from '@/stores/servers'
import { useNav } from '@/stores/nav'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { t } from '@/strings'

type ManagedLoader = LoaderAvailability['loader']
const LOADER_ORDER: ManagedLoader[] = ['vanilla', 'paper', 'fabric', 'forge', 'neoforge']
const EULA_URL = 'https://aka.ms/MinecraftEULA'

const gb = (mb: number): string => `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function uniqueName(existing: string[]): string {
  const base = t.create.namePlaceholder
  if (!existing.includes(base)) return base
  for (let i = 2; ; i++) if (!existing.includes(`${base} ${i}`)) return `${base} ${i}`
}

export function CreateServerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const advanced = useIsAdvanced()
  const eulaAcceptedAt = useSettings((s) => s.settings?.eulaAcceptedAt ?? null)
  const servers = useServers((s) => s.servers)
  const existingNames = useMemo(() => Object.values(servers).map((x) => x.config.name), [servers])
  const openServer = useNav((s) => s.openServer)

  const [versions, setVersions] = useState<McVersionInfo[] | null>(null)
  const [memory, setMemory] = useState<MemoryInfo | null>(null)
  const [loaders, setLoaders] = useState<LoaderAvailability[] | null>(null)

  const [name, setName] = useState('')
  const [mcVersion, setMcVersion] = useState('')
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [loader, setLoader] = useState<ManagedLoader>('vanilla')
  const [loaderVersion, setLoaderVersion] = useState<string | null>(null)
  const [memoryMb, setMemoryMb] = useState(3072)
  const [memoryTouched, setMemoryTouched] = useState(false)
  const [port, setPort] = useState('')
  const [gamemode, setGamemode] = useState<Gamemode>('survival')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [seed, setSeed] = useState('')
  const [whitelist, setWhitelist] = useState(false)
  const [eula, setEula] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Fresh form each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setName(uniqueName(existingNames))
    setLoader('vanilla')
    setLoaderVersion(null)
    setMemoryTouched(false)
    setPort('')
    setGamemode('survival')
    setDifficulty('easy')
    setSeed('')
    setWhitelist(false)
    setEula(false)
    setSubmitting(false)
    void api.catalog.mcVersions().then(
      ({ versions: list, latest }) => {
        setVersions(list)
        setMcVersion(latest)
      },
      (err) => toast.error(errorMessage(err))
    )
    void api.catalog.memory().then(setMemory)
  }, [open])

  // What's available for the chosen Minecraft version.
  useEffect(() => {
    if (!open || !mcVersion) return
    let current = true
    setLoaders(null)
    void api.catalog.loaders(mcVersion).then((list) => {
      if (!current) return
      setLoaders(list)
      const chosen = list.find((l) => l.loader === loader)
      if (!chosen?.available) setLoader('vanilla')
      setLoaderVersion(null)
    })
    return () => {
      current = false
    }
  }, [open, mcVersion])

  // Suggested memory follows the server type until the user moves the slider.
  useEffect(() => {
    if (!memory || memoryTouched) return
    setMemoryMb(loader === 'vanilla' || loader === 'paper' ? memory.recommendedVanillaMb : memory.recommendedModdedMb)
  }, [loader, memory, memoryTouched])

  const shownVersions = useMemo(
    () => (versions ?? []).filter((v) => v.type === 'release' || (advanced && showSnapshots) || v.id === mcVersion),
    [versions, advanced, showSnapshots, mcVersion]
  )
  const latestRelease = versions?.find((v) => v.type === 'release')?.id
  const availability = loaders?.find((l) => l.loader === loader)
  const recommendedMb =
    memory && (loader === 'vanilla' || loader === 'paper' ? memory.recommendedVanillaMb : memory.recommendedModdedMb)
  const needsEula = !eulaAcceptedAt
  const canSubmit =
    !!name.trim() && !!mcVersion && !!availability?.available && (!needsEula || eula) && !submitting

  const submit = async (): Promise<void> => {
    setSubmitting(true)
    try {
      const parsedPort = port.trim() ? Number(port) : null
      const { id } = await api.servers.create({
        name,
        mcVersion,
        loader,
        loaderVersion: advanced ? loaderVersion : null,
        memoryMb,
        port: parsedPort,
        acceptEula: needsEula ? eula : false,
        gamemode,
        difficulty,
        seed,
        whitelist
      })
      onOpenChange(false)
      openServer(id)
    } catch (err) {
      toast.error(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{t.create.title}</DialogTitle>
          <DialogDescription className="sr-only">{t.create.title}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-6 px-6 py-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label={t.create.name} htmlFor="create-name">
                <Input id="create-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t.create.version}>
                <Select value={mcVersion} onValueChange={setMcVersion} disabled={!versions}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.create.loading} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {shownVersions.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.id}
                        {v.id === latestRelease && <span className="text-muted-foreground"> ({t.create.latest})</span>}
                        {v.type === 'snapshot' && <span className="text-muted-foreground"> (snapshot)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {advanced && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={showSnapshots} onCheckedChange={setShowSnapshots} className="scale-75" />
                    {t.create.showSnapshots}
                  </label>
                )}
              </Field>
            </div>

            <div className="space-y-2">
              <Label>{t.create.type}</Label>
              <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LOADER_ORDER.map((l) => {
                  const info = loaders?.find((x) => x.loader === l)
                  const disabled = !info?.available
                  const selected = loader === l
                  return (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      onClick={() => {
                        setLoader(l)
                        setLoaderVersion(null)
                      }}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors',
                        selected ? 'border-primary bg-accent' : 'hover:border-primary/40',
                        disabled && 'cursor-not-allowed opacity-50 hover:border-border'
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {LOADER_LABELS[l]}
                        {!loaders && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {disabled && info?.reason ? info.reason : t.loaders[l]}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t.create.gameplay}
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.serverSettings.gamemode}>
                  <Select value={gamemode} onValueChange={(v) => setGamemode(v as Gamemode)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(t.serverSettings.gamemodes) as Gamemode[]).map((g) => (
                        <SelectItem key={g} value={g}>
                          {t.serverSettings.gamemodes[g]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t.serverSettings.difficulty}>
                  <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(t.serverSettings.difficulties) as Difficulty[]).map((d) => (
                        <SelectItem key={d} value={d}>
                          {t.serverSettings.difficulties[d]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label={t.create.seed} htmlFor="create-seed">
                <Input
                  id="create-seed"
                  value={seed}
                  maxLength={64}
                  placeholder={t.create.seedPlaceholder}
                  onChange={(e) => setSeed(e.target.value)}
                />
              </Field>
              <label className="flex items-start justify-between gap-4">
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{t.create.whitelist}</span>
                  <span className="block text-xs text-muted-foreground">{t.create.whitelistHint}</span>
                </span>
                <Switch checked={whitelist} onCheckedChange={setWhitelist} />
              </label>
            </div>

            {memory && (
              <Field
                label={`${t.create.memory}: ${advanced ? `${memoryMb} MB` : gb(memoryMb)}`}
                hint={recommendedMb ? t.create.memoryHint(gb(recommendedMb)) : undefined}
              >
                {advanced ? (
                  <Input
                    type="number"
                    min={512}
                    max={memory.maxMb}
                    step={256}
                    value={memoryMb}
                    onChange={(e) => {
                      setMemoryTouched(true)
                      setMemoryMb(Number(e.target.value) || 512)
                    }}
                  />
                ) : (
                  <Slider
                    min={1024}
                    max={memory.maxMb}
                    step={512}
                    value={[memoryMb]}
                    onValueChange={([v]) => {
                      setMemoryTouched(true)
                      setMemoryMb(v)
                    }}
                  />
                )}
              </Field>
            )}

            {advanced && (
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.create.loaderVersion}>
                  <Select
                    value={loaderVersion ?? availability?.versions[0]?.id ?? ''}
                    onValueChange={setLoaderVersion}
                    disabled={!availability?.available || loader === 'vanilla'}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="â€”" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {availability?.versions.slice(0, 200).map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t.create.port} htmlFor="create-port">
                  <Input
                    id="create-port"
                    inputMode="numeric"
                    placeholder={t.create.portAuto}
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  />
                </Field>
              </div>
            )}

            {needsEula ? (
              <label className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                <Checkbox checked={eula} onCheckedChange={(v) => setEula(v === true)} className="mt-0.5" />
                <span>
                  {t.create.eula}{' '}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                    onClick={(e) => {
                      e.preventDefault()
                      void api.app.openExternal(EULA_URL)
                    }}
                  >
                    {t.create.eulaLink}
                    <ExternalLink className="size-3" />
                  </button>
                  .
                </span>
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t.create.eulaAgreed(new Date(eulaAcceptedAt!).toLocaleDateString())}
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.create.cancel}
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {submitting && <Loader2 className="animate-spin" />}
            {t.create.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
