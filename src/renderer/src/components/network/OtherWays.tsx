import { useEffect, useState } from 'react'
import { ExternalLink, Network } from 'lucide-react'
import { toast } from 'sonner'
import type { InternetMethod, ServerNetworkView } from '@shared/network'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { CopyField } from '@/components/CopyField'
import { useTunnelConfirm } from '@/components/network/TunnelButton'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { t } from '@/strings'

const a = t.network.advanced
// bore is hidden on Windows: Defender flags it (SPEC §7.2).
const METHODS: InternetMethod[] = navigator.userAgent.includes('Windows')
  ? ['direct', 'manual', 'playit', 'custom']
  : ['direct', 'manual', 'playit', 'bore', 'custom']

/** Advanced: pick exactly how friends outside reach the server. */
export function OtherWays({ serverId, view }: { serverId: string; view: ServerNetworkView }) {
  const cfg = view.config
  const [method, setMethod] = useState<InternetMethod>(cfg.method)
  const [relay, setRelay] = useState(cfg.boreRelay)
  const [command, setCommand] = useState(cfg.customCommand)
  const [address, setAddress] = useState(cfg.customAddress)
  const tunnel = useTunnelConfirm(serverId)

  useEffect(() => setMethod(cfg.method), [cfg.method])

  const apply = async (): Promise<void> => {
    try {
      if (method === 'playit') await tunnel.ask()
      else {
        await api.network.setMethod(serverId, method, {
          boreRelay: relay,
          customCommand: command,
          customAddress: address
        })
      }
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const changed =
    method !== cfg.method ||
    (method === 'bore' && relay !== cfg.boreRelay) ||
    (method === 'custom' && (command !== cfg.customCommand || address !== cfg.customAddress))

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{a.title}</h3>
        <p className="text-sm text-muted-foreground">{a.hint}</p>
      </div>
      <RadioGroup value={method} onValueChange={(v) => setMethod(v as InternetMethod)} className="gap-3">
        {METHODS.map((m) => (
          <div key={m} className="space-y-2">
            <div className="flex items-start gap-3">
              <RadioGroupItem value={m} id={`method-${m}`} className="mt-0.5" />
              <Label htmlFor={`method-${m}`} className="font-normal">
                {a[m]}
              </Label>
            </div>
            {m === 'bore' && method === 'bore' && (
              <div className="ml-7 flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">{a.boreRelay}</Label>
                <Input className="h-8 w-56" value={relay} onChange={(e) => setRelay(e.target.value)} />
              </div>
            )}
            {m === 'custom' && method === 'custom' && (
              <div className="ml-7 space-y-2">
                <Label className="text-xs text-muted-foreground">{a.customCommand}</Label>
                <Input className="font-mono text-xs" value={command} onChange={(e) => setCommand(e.target.value)} />
                <Label className="text-xs text-muted-foreground">{a.customAddress}</Label>
                <Input className="font-mono text-xs" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            )}
          </div>
        ))}
      </RadioGroup>
      <div className="flex items-center justify-between gap-2">
        {cfg.method === 'playit' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void api.network.unlinkPlayit().catch((err) => toast.error(errorMessage(err)))}
          >
            {a.unlink}
          </Button>
        ) : (
          <span />
        )}
        <Button size="sm" disabled={!changed} onClick={() => void apply()}>
          {a.apply}
        </Button>
      </div>
      {tunnel.dialog}
    </section>
  )
}

/** Tailscale / ZeroTier: detected addresses, or where to get them. */
export function MeshSection({ view }: { view: ServerNetworkView }) {
  const m = t.network.mesh
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Network className="size-4" />
        {m.title}
      </h3>
      {view.mesh.length > 0 ? (
        view.mesh.map((x) => {
          const name = x.kind === 'tailscale' ? 'Tailscale' : 'ZeroTier'
          return (
            <div key={x.address} className="space-y-1.5">
              <p className="text-sm text-muted-foreground">{m.found(name)}</p>
              <CopyField value={x.address} />
            </div>
          )
        })
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{m.none}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void api.app.openExternal('https://tailscale.com/download')}>
              <ExternalLink />
              {m.tailscale}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void api.app.openExternal('https://www.zerotier.com/download/')}>
              <ExternalLink />
              {m.zerotier}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
