import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import {
  GAME_RULE_CATEGORIES,
  GAME_RULES_BY_ID,
  describeGameRule,
  type GameRuleCategory,
  type GameRuleState,
  type GameRulesView
} from '@shared/gamerules'
import type { ServerSummary } from '@shared/servers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { t } from '@/strings'

const g = t.gamerules

function NumberBox({ value, min, max, onCommit }: { value: number; min?: number; max?: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = (): void => {
    const n = Math.round(Number(draft))
    if (!Number.isFinite(n) || draft.trim() === '') return setDraft(String(value))
    const clamped = Math.min(max ?? n, Math.max(min ?? n, n))
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }
  return (
    <Input
      className="w-28 text-right"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d-]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function RuleRow({ rule, onSet }: { rule: GameRuleState; onSet: (v: boolean | number) => void }) {
  const def = GAME_RULES_BY_ID[rule.id]
  const value = rule.value ?? def.default
  const isNormal = value === def.default
  const normalText = def.type === 'bool' ? (def.default ? g.on : g.off) : String(def.default)
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {def.title}
          {rule.pending && <span className="rounded bg-warning/20 px-1.5 py-0.5 text-xs font-normal">{g.pending}</span>}
        </p>
        <p className="text-xs text-muted-foreground">{describeGameRule(def, value)}</p>
        {!isNormal && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {g.normal(normalText)}
            <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => onSet(def.default)}>
              <RotateCcw className="size-3" />
              {g.reset}
            </button>
          </p>
        )}
      </div>
      <div className="shrink-0">
        {def.type === 'bool' ? (
          <Switch checked={value === true} onCheckedChange={(v) => onSet(v)} aria-label={def.title} />
        ) : (
          <NumberBox value={Number(value)} min={def.min} max={def.max} onCommit={onSet} />
        )}
      </div>
    </div>
  )
}

/** Every game rule the world's Minecraft version has, grouped, each saying what its current value does. */
export function GameRulesSection({ server }: { server: ServerSummary }) {
  const id = server.config.id
  const [view, setView] = useState<GameRulesView | null>(null)
  const [open, setOpen] = useState<Set<GameRuleCategory>>(new Set(['player']))
  const running = server.status === 'running'

  const load = useCallback(() => api.gamerules.view(id).then(setView).catch(() => undefined), [id])
  useEffect(() => {
    void load()
    return api.gamerules.onChanged((changed) => changed === id && void load())
  }, [id, load])
  useEffect(() => void load(), [running, load])

  const set = async (ruleId: string, value: boolean | number): Promise<void> => {
    if (view) setView({ ...view, rules: view.rules.map((r) => (r.id === ruleId ? { ...r, value, pending: !running } : r)) })
    try {
      setView(await api.gamerules.set(id, ruleId, value))
    } catch (err) {
      toast.error(errorMessage(err))
      void load()
    }
  }

  const header = (
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.title}</h2>
      </div>
      {view && view.rules.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void api.gamerules
              .resetAll(id)
              .then((v) => {
                setView(v)
                toast.success(g.resetAllDone)
              })
              .catch((err) => toast.error(errorMessage(err)))
          }
        >
          <RotateCcw />
          {g.resetAll}
        </Button>
      )}
    </div>
  )

  if (!view) {
    return (
      <section className="space-y-3">
        {header}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {g.loading}
        </p>
      </section>
    )
  }

  const byCategory = new Map<GameRuleCategory, GameRuleState[]>()
  for (const r of view.rules) {
    const cat = GAME_RULES_BY_ID[r.id].category
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), r])
  }

  return (
    <section className="space-y-3">
      {header}
      {view.rules.length === 0 && <p className="text-sm text-muted-foreground">{g.notYet}</p>}
      {!running && view.rules.some((r) => r.pending) && <p className="text-sm text-muted-foreground">{g.pendingNote}</p>}
      {(Object.keys(GAME_RULE_CATEGORIES) as GameRuleCategory[])
        .filter((c) => byCategory.has(c))
        .map((cat) => {
          const isOpen = open.has(cat)
          const rules = byCategory.get(cat) ?? []
          const changed = rules.filter((r) => (r.value ?? GAME_RULES_BY_ID[r.id].default) !== GAME_RULES_BY_ID[r.id].default).length
          return (
            <div key={cat} className="rounded-lg border bg-card">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpen((prev) => {
                    const next = new Set(prev)
                    if (next.has(cat)) next.delete(cat)
                    else next.add(cat)
                    return next
                  })
                }
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ChevronRight className={`size-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  {GAME_RULE_CATEGORIES[cat]}
                  <span className="text-xs font-normal text-muted-foreground">
                    {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
                    {changed > 0 ? ` · ${changed} changed from normal` : ''}
                  </span>
                </span>
              </button>
              {isOpen && (
                <div className="divide-y border-t px-4">
                  {rules.map((r) => (
                    <RuleRow key={r.id} rule={r} onSet={(v) => void set(r.id, v)} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
    </section>
  )
}
