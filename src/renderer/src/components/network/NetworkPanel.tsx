import { useEffect, useState } from 'react'
import { CheckCircle2, Globe, Loader2, Monitor, ShieldAlert, ShieldCheck, Wifi, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import type { DoctorFix, ServerNetworkView } from '@shared/network'
import type { ServerSummary } from '@shared/servers'
import { Button } from '@/components/ui/button'
import { CopyField } from '@/components/CopyField'
import { AudienceChooser } from '@/components/network/AudienceChooser'
import { DoctorCard } from '@/components/network/DoctorCard'
import { TunnelButton, useTunnelConfirm } from '@/components/network/TunnelButton'
import { useIsAdvanced } from '@/stores/settings'
import { useNetwork } from '@/stores/network'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { t } from '@/strings'

const n = t.network

export function useServerNetwork(id: string): ServerNetworkView | undefined {
  const view = useNetwork((s) => s.views[id])
  const load = useNetwork((s) => s.load)
  useEffect(() => {
    void load(id)
  }, [id, load])
  return view
}

/** Runs the one-time admin-permission firewall fix and reports the outcome in plain words. */
export async function fixFirewallWithToast(serverId: string): Promise<void> {
  const result = await api.network.fixFirewall()
  if (result === 'fixed') toast.success(n.firewallFixed)
  else if (result === 'cancelled') toast.info(n.firewallCancelled)
  else toast.error(n.firewallFailed)
  await useNetwork.getState().load(serverId, true)
}

function AddressRow({
  icon: Icon,
  label,
  value,
  status
}: {
  icon: LucideIcon
  label: string
  value: string | null
  status?: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-center gap-3 py-3">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
      <div className="min-w-0 space-y-1.5">
        {value ? <CopyField value={value} /> : <span className="text-sm text-muted-foreground">{n.notAvailable}</span>}
        {status}
      </div>
    </div>
  )
}

export function NetworkPanel({ server }: { server: ServerSummary }) {
  const id = server.config.id
  const view = useServerNetwork(id)
  const advanced = useIsAdvanced()
  const tunnel = useTunnelConfirm(id)
  const [fixingFirewall, setFixingFirewall] = useState(false)

  if (!view) return null
  const audience = view.config.audience
  const net = view.internet
  const fw = view.firewall
  const fwNeedsFix = fw && (fw.state === 'blocked' || fw.state === 'not-allowed')

  const fixFirewall = async (): Promise<void> => {
    setFixingFirewall(true)
    try {
      await fixFirewallWithToast(id)
    } finally {
      setFixingFirewall(false)
    }
  }

  const onFix = async (fix: DoctorFix): Promise<void> => {
    try {
      if (fix === 'start-server') await api.servers.start(id)
      else if (fix === 'firewall') await fixFirewall()
      else if (fix === 'retry-router') await api.network.retry(id)
      else if (fix === 'tunnel') await tunnel.ask()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{n.chooserTitle}</h3>
        <AudienceChooser
          value={audience}
          onChoose={(choice) =>
            void api.network.setAudience(id, choice).catch((err) => toast.error(errorMessage(err)))
          }
        />
      </section>

      <section className="rounded-xl border bg-card px-5 py-2">
        <AddressRow icon={Monitor} label={n.thisPc} value={view.addresses.thisPc} />
        {(audience === 'lan' || audience === 'internet') && (
          <div className="border-t">
            <AddressRow icon={Wifi} label={n.sameWifi} value={view.addresses.lan} />
          </div>
        )}
        {audience === 'internet' && (
          <div className="border-t">
            <AddressRow
              icon={Globe}
              label={n.internet}
              value={view.addresses.internet}
              status={
                <p
                  className={cn(
                    'flex items-center gap-1.5 text-sm',
                    net.state === 'needs-help' ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {net.state === 'working' && <Loader2 className="size-3.5 animate-spin" />}
                  {net.state === 'ready' && <CheckCircle2 className="size-3.5 text-success" />}
                  {net.message}
                </p>
              }
            />
            {net.state === 'needs-help' && (
              <div className="flex flex-wrap items-center gap-2 pb-3 pl-[9.75rem]">
                {view.config.method === 'direct' && <TunnelButton serverId={id} />}
                <Button size="sm" variant="outline" onClick={() => void api.network.retry(id)}>
                  {n.retry}
                </Button>
                {view.config.method === 'direct' && (
                  <span className="w-full text-xs text-muted-foreground">{n.useTunnelHint}</span>
                )}
              </div>
            )}
            {view.config.method === 'playit' && net.state !== 'needs-help' && (
              <div className="flex flex-wrap items-center gap-2 pb-3 pl-[9.75rem] text-xs text-muted-foreground">
                {n.usingTunnel}
                {advanced && (
                  <Button size="xs" variant="ghost" onClick={() => void api.network.useDirect(id)}>
                    {n.useDirect}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {fw && (audience === 'lan' || audience === 'internet') && (
        <section className="flex items-start justify-between gap-4 rounded-xl border bg-card p-5">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {fwNeedsFix ? (
                <ShieldAlert className="size-4 text-destructive" />
              ) : (
                <ShieldCheck className="size-4 text-success" />
              )}
              {n.firewall}
            </h3>
            <p className="text-sm text-muted-foreground">{fwNeedsFix ? fw.detail : n.firewallOk}</p>
            {fwNeedsFix && <p className="text-xs text-muted-foreground">{n.firewallFixHint}</p>}
            {fw.networkCategory === 'Public' && !fw.routerRepliesAllowed && (
              <p className="text-xs text-muted-foreground">{n.publicNetwork}</p>
            )}
          </div>
          {(fwNeedsFix || !fw.routerRepliesAllowed) && (
            <Button onClick={() => void fixFirewall()} disabled={fixingFirewall}>
              {fixingFirewall && <Loader2 className="animate-spin" />}
              {n.firewallFix}
            </Button>
          )}
        </section>
      )}

      <DoctorCard server={server} onFix={onFix} />
      {tunnel.dialog}
    </div>
  )
}
