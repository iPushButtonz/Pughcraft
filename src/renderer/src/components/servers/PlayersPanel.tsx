import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Ban, Crown, Loader2, MoreHorizontal, Shield, UserPlus, UserX, X } from 'lucide-react'
import { toast } from 'sonner'
import type { PlayerAction, PlayerEntry, PlayersView } from '@shared/players'
import type { ServerSummary } from '@shared/servers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useIsAdvanced } from '@/stores/settings'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { timeAgo } from '@/lib/time'
import { t } from '@/strings'

const p = t.players

/** Runs a player action and shows what went wrong, if anything. */
export async function playerAction(serverId: string, action: PlayerAction, target: string, reason?: string): Promise<boolean> {
  try {
    await api.players.act(serverId, { action, target, reason })
    return true
  } catch (err) {
    toast.error(errorMessage(err))
    return false
  }
}

/** The small menu next to an online player: kick, op, whitelist, ban. */
export function PlayerMenu({ serverId, name, isOp, whitelisted }: { serverId: string; name: string; isOp?: boolean; whitelisted?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={name}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void playerAction(serverId, 'kick', name)}>
          <UserX />
          {p.kick}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void playerAction(serverId, isOp ? 'deop' : 'op', name)}>
          <Crown />
          {isOp ? p.removeOp : p.makeOp}
        </DropdownMenuItem>
        {!whitelisted && (
          <DropdownMenuItem onClick={() => void playerAction(serverId, 'whitelist-add', name)}>
            <UserPlus />
            {p.addToWhitelist}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void playerAction(serverId, 'ban', name)}>
          <Ban />
          {p.ban}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A name box plus button that adds someone to a list. */
function AddRow({
  placeholder,
  withReason,
  onAdd
}: {
  placeholder: string
  withReason?: boolean
  onAdd: (target: string, reason: string) => Promise<boolean>
}) {
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (): Promise<void> => {
    if (!target.trim() || busy) return
    setBusy(true)
    if (await onAdd(target.trim(), reason.trim())) {
      setTarget('')
      setReason('')
    }
    setBusy(false)
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Input className="w-48" placeholder={placeholder} value={target} maxLength={45} onChange={(e) => setTarget(e.target.value)} />
      {withReason && <Input className="min-w-0 flex-1" placeholder={p.reasonPlaceholder} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />}
      <Button type="submit" variant="outline" disabled={!target.trim() || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
        {p.add}
      </Button>
    </form>
  )
}

function ListSection({
  icon,
  title,
  hint,
  children,
  add
}: {
  icon: ReactNode
  title: string
  hint?: ReactNode
  children: ReactNode
  add?: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h3>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {add}
      {children}
    </section>
  )
}

function Rows({ items, empty, actionLabel, onAction }: { items: PlayerEntry[]; empty: string; actionLabel: string; onAction: (name: string) => void }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((x) => (
        <li key={`${x.uuid ?? ''}${x.name}`} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm">{x.name}</p>
            {x.detail && <p className="truncate text-xs text-muted-foreground">{x.detail}</p>}
          </div>
          <Button size="sm" variant="ghost" onClick={() => onAction(x.name)}>
            {actionLabel}
          </Button>
        </li>
      ))}
    </ul>
  )
}

export function PlayersPanel({ server }: { server: ServerSummary }) {
  const id = server.config.id
  const advanced = useIsAdvanced()
  const [view, setView] = useState<PlayersView | null>(null)

  const load = useCallback(() => api.players.view(id).then(setView).catch(() => undefined), [id])
  useEffect(() => {
    void load()
    return api.players.onChanged((changed) => changed === id && void load())
  }, [id, load])
  useEffect(() => void load(), [server.players, server.status, load])

  if (!view) return null
  const act = (action: PlayerAction) => (target: string, reason = '') => playerAction(id, action, target, reason || undefined)
  const opNames = new Set(view.ops.map((o) => o.name.toLowerCase()))
  const wlNames = new Set(view.whitelist.map((o) => o.name.toLowerCase()))

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      {view.requests.length > 0 && (
        <section className="space-y-3 rounded-xl border border-primary/40 bg-card p-5">
          <h3 className="text-sm font-semibold">{p.requestsTitle}</h3>
          <ul className="space-y-2">
            {view.requests.map((r) => (
              <li key={r.name} className="flex items-center justify-between gap-3">
                <p className="text-sm">
                  {p.requestLine(r.name)} <span className="text-muted-foreground">· {timeAgo(r.at)}</span>
                </p>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => void act('whitelist-add')(r.name).then((ok) => ok && toast.success(p.allowed(r.name)))}>
                    {p.allow}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void api.players.dismissRequest(id, r.name)}>
                    {p.ignore}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(view.offlineMode || !view.running) && (
        <div className="space-y-1 text-sm text-muted-foreground">
          {view.offlineMode && <p>{p.offlineNote}</p>}
          {!view.running && <p>{p.stoppedNote}</p>}
        </div>
      )}

      {view.running && (
        <ListSection icon={<span className="size-2 rounded-full bg-success" />} title={`${p.online} · ${view.online.length}`}>
          {view.online.length === 0 ? (
            <p className="text-sm text-muted-foreground">{p.nobody}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {view.online.map((name) => (
                <li key={name} className="flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2.5 font-mono text-sm">
                  {name}
                  <PlayerMenu serverId={id} name={name} isOp={opNames.has(name.toLowerCase())} whitelisted={wlNames.has(name.toLowerCase())} />
                </li>
              ))}
            </ul>
          )}
        </ListSection>
      )}

      <ListSection
        icon={<Shield className="size-4" />}
        title={p.whitelist}
        hint={view.whitelistOn ? p.whitelistOn : p.whitelistOff}
        add={<AddRow placeholder={p.addPlaceholder} onAdd={act('whitelist-add')} />}
      >
        <Rows items={view.whitelist} empty={p.whitelistEmpty} actionLabel={p.remove} onAction={(n) => void act('whitelist-remove')(n)} />
      </ListSection>

      <ListSection icon={<Crown className="size-4" />} title={p.ops} hint={p.opsHint} add={<AddRow placeholder={p.addPlaceholder} onAdd={act('op')} />}>
        <Rows
          items={view.ops.map((o) => ({ ...o, detail: o.detail ? p.level(o.detail) : null }))}
          empty={p.opsEmpty}
          actionLabel={p.remove}
          onAction={(n) => void act('deop')(n)}
        />
      </ListSection>

      <ListSection icon={<Ban className="size-4" />} title={p.bans} add={<AddRow placeholder={p.addPlaceholder} withReason onAdd={act('ban')} />}>
        <Rows items={view.bans} empty={p.bansEmpty} actionLabel={p.unban} onAction={(n) => void act('pardon')(n)} />
      </ListSection>

      {advanced && (
        <ListSection icon={<X className="size-4" />} title={p.ipBans} add={<AddRow placeholder={p.ipPlaceholder} withReason onAdd={act('ban-ip')} />}>
          <Rows
            items={view.ipBans.map((b) => ({ name: b.ip, uuid: null, detail: b.reason }))}
            empty={p.ipBansEmpty}
            actionLabel={p.unban}
            onAction={(ip) => void act('pardon-ip')(ip)}
          />
        </ListSection>
      )}
    </div>
  )
}
