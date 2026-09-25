import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ImagePlus, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { MemoryInfo, ServerPropertiesView, ServerSummary } from '@shared/servers'
import { PROPERTY_DEFS, PROPERTY_SECTIONS, describeProperty, type PropertyDef, type PropertySection } from '@shared/properties'
import type { ServerConfigPatch } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingRow, SettingSection } from '@/components/SettingRow'
import { GameRulesSection } from '@/components/servers/GameRulesSection'
import { PlayersPanel } from '@/components/servers/PlayersPanel'
import { useIsAdvanced } from '@/stores/settings'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { t } from '@/strings'

const s = t.serverSettings
const gb = (mb: number): string => `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`

/** A text input that saves when it loses focus or Enter is pressed. */
function CommitInput({
  value,
  onCommit,
  ...props
}: { value: string; onCommit: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Input
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

const Hint = ({ children }: { children: React.ReactNode }) => (children ? <span className="text-xs">{children}</span> : null)

/** One server.properties key as the right kind of control. */
function PropertyRow({ def, value, onSet }: { def: PropertyDef; value: string; onSet: (key: string, value: string) => void }) {
  let control: React.ReactNode
  if (def.type === 'bool') {
    control = <Switch checked={value.trim().toLowerCase() === 'true'} onCheckedChange={(on) => onSet(def.key, String(on))} />
  } else if (def.type === 'int') {
    control = (
      <CommitInput
        className="w-32"
        inputMode="numeric"
        value={value}
        onCommit={(v) => {
          const n = Math.round(Number(v))
          if (v.trim() === '' || !Number.isFinite(n)) {
            toast.error(s.needNumber)
            return
          }
          onSet(def.key, String(Math.min(def.max, Math.max(def.min, n))))
        }}
      />
    )
  } else if (def.type === 'enum') {
    const options = def.options.some((o) => o.value === value) ? def.options : [{ value, label: value }, ...def.options]
    control = (
      <Select value={value} onValueChange={(v) => onSet(def.key, v)}>
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else {
    control = (
      <CommitInput
        className={def.wide ? 'w-80' : 'w-56'}
        type={def.secret ? 'password' : 'text'}
        value={value}
        onCommit={(v) => onSet(def.key, v)}
      />
    )
  }
  return (
    <SettingRow label={def.label} hint={<Hint>{describeProperty(def, value)}</Hint>}>
      <div className="flex items-center gap-3">
        <code className="hidden text-xs text-muted-foreground sm:inline">{def.key}</code>
        {control}
      </div>
    </SettingRow>
  )
}

/** server-icon.png: drop an image on the square or click it to pick one. */
function IconRow({ serverId }: { serverId: string }) {
  const [icon, setIcon] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  useEffect(() => {
    void api.servers.icon(serverId).then(setIcon)
  }, [serverId])

  const run = (fn: () => Promise<string | null>, keepOnNull = false): void => {
    void fn().then(
      (next) => (next !== null || !keepOnNull) && setIcon(next),
      (err) => toast.error(errorMessage(err))
    )
  }

  return (
    <SettingRow label={s.icon} hint={<Hint>{s.iconHint}</Hint>}>
      <div className="flex items-center gap-3">
        {icon && (
          <Button variant="ghost" size="sm" onClick={() => run(() => api.servers.setIcon(serverId, null))}>
            {s.iconRemove}
          </Button>
        )}
        <button
          type="button"
          data-drop-zone
          title={s.iconDrop}
          aria-label={s.iconDrop}
          className={`flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-dashed transition-colors ${
            over ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60'
          }`}
          onClick={() => run(() => api.servers.pickIcon(serverId), true)}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const file = e.dataTransfer.files[0]
            if (!file) return
            if (!/\.(png|jpe?g|bmp|gif)$/i.test(file.name)) {
              toast.error(s.iconNotImage)
              return
            }
            run(() => api.servers.setIcon(serverId, api.imports.pathForFile(file)))
          }}
        >
          {icon ? (
            <img src={icon} alt="" className="size-full [image-rendering:pixelated]" />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" />
          )}
        </button>
      </div>
    </SettingRow>
  )
}

function Collapsible({ title, count, defaultOpen, children }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group space-y-1">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase select-none">
        <ChevronDown className="size-4 transition-transform group-not-open:-rotate-90" />
        {title}
        {count !== undefined && <span className="font-normal normal-case">({count})</span>}
      </summary>
      {children}
    </details>
  )
}

export function ServerSettingsPanel({ server }: { server: ServerSummary }) {
  const id = server.config.id
  const advanced = useIsAdvanced()
  const [view, setView] = useState<ServerPropertiesView | null>(null)
  const [memory, setMemory] = useState<MemoryInfo | null>(null)
  const [raw, setRaw] = useState('')
  const [jvm, setJvm] = useState(server.config.jvmArgs.join('\n'))
  const [memDraft, setMemDraft] = useState(server.config.memoryMb)
  const [query, setQuery] = useState('')

  const reload = useCallback(async () => {
    const v = await api.servers.properties(id)
    setView(v)
    setRaw(v.raw)
  }, [id])

  // Re-read after the first start: that's when the server writes its full settings file.
  const running = server.status === 'running'
  useEffect(() => {
    void reload()
  }, [reload, running])
  useEffect(() => {
    void api.catalog.memory().then(setMemory)
  }, [])
  useEffect(() => setJvm(server.config.jvmArgs.join('\n')), [server.config.jvmArgs])
  useEffect(() => setMemDraft(server.config.memoryMb), [server.config.memoryMb])

  const setProperty = async (key: string, value: string): Promise<void> => {
    if (view) setView({ ...view, values: { ...view.values, [key]: value } })
    try {
      const next = await api.servers.setProperties(id, { [key]: value })
      setView(next)
      setRaw(next.raw)
    } catch (err) {
      toast.error(errorMessage(err))
      void reload()
    }
  }

  const updateConfig = async (patch: ServerConfigPatch): Promise<void> => {
    try {
      await api.servers.update(id, patch)
      if (patch.port !== undefined) void reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = new Map<PropertySection, PropertyDef[]>()
    for (const def of PROPERTY_DEFS) {
      if (def.optional && !(view && def.key in view.values)) continue
      if (q && !def.label.toLowerCase().includes(q) && !def.key.toLowerCase().includes(q)) continue
      out.set(def.section, [...(out.get(def.section) ?? []), def])
    }
    return out
  }, [query, view])

  if (!view) return null
  const searching = query.trim() !== ''

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      {!view.complete && <p className="text-sm text-muted-foreground">{s.firstStartNote}</p>}

      <SettingSection title={s.general}>
        <SettingRow label={s.name}>
          <CommitInput className="w-64" value={server.config.name} maxLength={40} onCommit={(v) => void updateConfig({ name: v })} />
        </SettingRow>
        {memory && !advanced && (
          <SettingRow label={`${s.memory}: ${gb(memDraft)}`} stacked>
            <Slider
              min={1024}
              max={memory.maxMb}
              step={512}
              value={[memDraft]}
              onValueChange={([v]) => setMemDraft(v)}
              onValueCommit={([v]) => void updateConfig({ memoryMb: v })}
            />
          </SettingRow>
        )}
      </SettingSection>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder={s.search} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {[...grouped.entries()].map(([section, defs]) => (
        <Collapsible key={section} title={PROPERTY_SECTIONS[section]} count={defs.length} defaultOpen={searching || section === 'world' || section === 'gameplay'}>
          <div className="divide-y rounded-lg border bg-card px-4">
            {defs.map((def) => (
              <Fragment key={def.key}>
                <PropertyRow
                  def={def}
                  value={view.values[def.key] ?? String(def.default)}
                  onSet={(k, v) => void setProperty(k, v)}
                />
                {def.key === 'motd' && <IconRow serverId={id} />}
              </Fragment>
            ))}
          </div>
        </Collapsible>
      ))}
      {searching && grouped.size === 0 && <p className="text-sm text-muted-foreground">{s.noMatch}</p>}

      {!searching && (
        <>
          <GameRulesSection server={server} />
          <Collapsible title={t.players.tab} defaultOpen>
            <PlayersPanel server={server} />
          </Collapsible>
        </>
      )}

      {advanced && (
        <>
          <SettingSection title="Java">
            <SettingRow label={s.memoryExact}>
              <CommitInput
                className="w-32"
                inputMode="numeric"
                value={String(server.config.memoryMb)}
                onCommit={(v) => void updateConfig({ memoryMb: Number(v) || server.config.memoryMb })}
              />
            </SettingRow>
            <SettingRow label={s.port}>
              <CommitInput
                className="w-32"
                inputMode="numeric"
                value={String(server.config.port)}
                onCommit={(v) => void updateConfig({ port: Number(v) })}
              />
            </SettingRow>
            <SettingRow label={s.java}>
              <span className="text-sm text-muted-foreground">
                {server.config.javaPath ?? s.javaAuto(server.config.javaMajor)}
              </span>
            </SettingRow>
            <SettingRow label={s.jvmArgs} hint={s.jvmArgsHint} stacked>
              <Textarea
                data-selectable
                className="min-h-40 font-mono text-xs"
                value={jvm}
                spellCheck={false}
                onChange={(e) => setJvm(e.target.value)}
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setJvm(server.config.jvmArgs.join('\n'))}>
                  {s.revert}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void updateConfig({ jvmArgs: jvm.split('\n') }).then(() => toast.success(s.saved))}
                >
                  {s.save}
                </Button>
              </div>
            </SettingRow>
          </SettingSection>

          <SettingSection title={s.advancedTitle}>
            <SettingRow label={s.advancedTitle} hint={s.advancedHint} stacked>
              <Textarea
                data-selectable
                className="min-h-96 font-mono text-xs"
                value={raw}
                spellCheck={false}
                onChange={(e) => setRaw(e.target.value)}
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" size="sm" disabled={raw === view.raw} onClick={() => setRaw(view.raw)}>
                  {s.revert}
                </Button>
                <Button
                  size="sm"
                  disabled={raw === view.raw}
                  onClick={async () => {
                    try {
                      const next = await api.servers.setRaw(id, raw)
                      setView(next)
                      setRaw(next.raw)
                      toast.success(s.saved)
                    } catch (err) {
                      toast.error(errorMessage(err))
                    }
                  }}
                >
                  {s.save}
                </Button>
              </div>
            </SettingRow>
          </SettingSection>
        </>
      )}
    </div>
  )
}
