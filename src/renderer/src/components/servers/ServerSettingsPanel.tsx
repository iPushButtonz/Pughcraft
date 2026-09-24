import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  Difficulty,
  Gamemode,
  MemoryInfo,
  PerformancePreset,
  ServerPropertiesView,
  ServerSummary,
  SimpleProperties
} from '@shared/servers'
import type { ServerConfigPatch } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingRow, SettingSection } from '@/components/SettingRow'
import { Segmented } from '@/components/Segmented'
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

export function ServerSettingsPanel({ server }: { server: ServerSummary }) {
  const id = server.config.id
  const advanced = useIsAdvanced()
  const [view, setView] = useState<ServerPropertiesView | null>(null)
  const [memory, setMemory] = useState<MemoryInfo | null>(null)
  const [raw, setRaw] = useState('')
  const [jvm, setJvm] = useState(server.config.jvmArgs.join('\n'))
  const [memDraft, setMemDraft] = useState(server.config.memoryMb)

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

  const setSimple = async (patch: Partial<SimpleProperties>): Promise<void> => {
    if (view) setView({ ...view, simple: { ...view.simple, ...patch } })
    try {
      const next = await api.servers.setSimple(id, patch)
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

  if (!view) return null
  const p = view.simple

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-10">
      {!view.complete && <p className="text-sm text-muted-foreground">{s.firstStartNote}</p>}

      <SettingSection title={s.general}>
        <SettingRow label={s.name}>
          <CommitInput className="w-64" value={server.config.name} maxLength={40} onCommit={(v) => void updateConfig({ name: v })} />
        </SettingRow>
        <SettingRow label={s.motd}>
          <CommitInput className="w-64" value={p.motd} maxLength={120} onCommit={(v) => void setSimple({ motd: v })} />
        </SettingRow>
      </SettingSection>

      <SettingSection title={s.gameplay}>
        <SettingRow label={s.gamemode}>
          <Select value={p.gamemode} onValueChange={(v) => void setSimple({ gamemode: v as Gamemode })}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(s.gamemodes) as Gamemode[]).map((g) => (
                <SelectItem key={g} value={g}>
                  {s.gamemodes[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label={s.difficulty}>
          <Select value={p.difficulty} onValueChange={(v) => void setSimple({ difficulty: v as Difficulty })}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(s.difficulties) as Difficulty[]).map((d) => (
                <SelectItem key={d} value={d}>
                  {s.difficulties[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label={s.hardcore} hint={s.hardcoreHint}>
          <Switch checked={p.hardcore} onCheckedChange={(v) => void setSimple({ hardcore: v })} />
        </SettingRow>
        {p.pvp !== null && (
          <SettingRow label={s.pvp}>
            <Switch checked={p.pvp} onCheckedChange={(v) => void setSimple({ pvp: v })} />
          </SettingRow>
        )}
        <SettingRow label={s.allowFlight} hint={s.allowFlightHint}>
          <Switch checked={p.allowFlight} onCheckedChange={(v) => void setSimple({ allowFlight: v })} />
        </SettingRow>
        {p.commandBlocks !== null && (
          <SettingRow label={s.commandBlocks}>
            <Switch checked={p.commandBlocks} onCheckedChange={(v) => void setSimple({ commandBlocks: v })} />
          </SettingRow>
        )}
      </SettingSection>

      <SettingSection title={s.players}>
        <SettingRow label={s.maxPlayers}>
          <CommitInput
            className="w-24"
            inputMode="numeric"
            value={String(p.maxPlayers)}
            onCommit={(v) => void setSimple({ maxPlayers: Number(v) || p.maxPlayers })}
          />
        </SettingRow>
        <SettingRow label={s.whitelist} hint={s.whitelistHint}>
          <Switch checked={p.whitelist} onCheckedChange={(v) => void setSimple({ whitelist: v })} />
        </SettingRow>
      </SettingSection>

      <SettingSection title={s.performance}>
        <SettingRow label={s.performanceLabel} hint={s.performanceHint}>
          <div className="flex flex-col items-end gap-1">
            <Segmented<PerformancePreset | 'custom'>
              value={p.performance}
              options={(['low', 'balanced', 'high'] as const).map((v) => ({ value: v, label: s.performances[v] }))}
              onChange={(v) => v !== 'custom' && void setSimple({ performance: v })}
            />
            {p.performance === 'custom' && <span className="text-xs text-muted-foreground">{s.performances.custom}</span>}
          </div>
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
