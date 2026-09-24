import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { ServerNetworkView } from '@shared/network'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { OutsideConsent } from '@/components/network/DoctorCard'
import { useSettings } from '@/stores/settings'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { t } from '@/strings'

const g = t.network.guide

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span data-selectable className="font-mono font-medium">
        {value}
      </span>
    </div>
  )
}

/** Step-by-step port forwarding, filled in with this network's exact values. */
export function PortForwardGuide({
  serverId,
  view,
  open,
  onOpenChange
}: {
  serverId: string
  view: ServerNetworkView
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const outside = useSettings((s) => s.settings?.outsideChecks ?? 'ask')
  const updateSettings = useSettings((s) => s.update)
  const [asking, setAsking] = useState(false)
  const brand = t.network.brands[view.router.brand ?? 'other'] ?? t.network.brands.other
  const port = String(view.port)

  const useManual = async (): Promise<void> => {
    try {
      await api.network.setMethod(serverId, 'manual')
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-6 pt-6 pb-4">
            <DialogTitle>{g.title}</DialogTitle>
            <DialogDescription>{g.intro}</DialogDescription>
          </DialogHeader>
          <ol className="min-h-0 flex-1 list-decimal space-y-5 overflow-y-auto py-5 pr-6 pl-12 text-sm">
            <li className="space-y-2">
              <p className="font-medium">{g.step1}</p>
              {view.router.gateway && (
                <Button size="sm" variant="outline" onClick={() => void api.network.openRouterPage(serverId)}>
                  <ExternalLink />
                  {g.openRouter} ({view.router.gateway})
                </Button>
              )}
              <p className="text-muted-foreground">{g.step1Hint}</p>
            </li>
            <li className="space-y-1">
              <p className="font-medium">{g.step2}</p>
              {view.router.brand && view.router.brand !== 'other' && (
                <p className="text-muted-foreground">{g.detected(brand.name)}</p>
              )}
              <p>{brand.where}</p>
            </li>
            <li className="space-y-2">
              <p className="font-medium">{g.step3}</p>
              <div className="grid gap-1.5">
                <Value label={g.protocol} value="TCP" />
                <Value label={g.externalPort} value={port} />
                <Value label={g.internalIp} value={view.lanIp ?? '?'} />
                <Value label={g.internalPort} value={port} />
              </div>
            </li>
            <li className="space-y-1">
              <p className="font-medium">{g.step4}</p>
              <p className="text-muted-foreground">{g.step4Hint}</p>
            </li>
            <li className="space-y-1">
              <p className="font-medium">{g.step5}</p>
            </li>
            <li className="list-none space-y-2 rounded-lg border bg-muted/30 p-3 text-muted-foreground">
              <p>
                {g.orUpnp} ({brand.upnp})
              </p>
              <p>{g.noAccess}</p>
            </li>
          </ol>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.create.cancel}
            </Button>
            <Button onClick={() => (outside === 'on-demand' ? void useManual() : setAsking(true))}>{g.done}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OutsideConsent
        open={asking}
        onDecide={(choice) => {
          setAsking(false)
          if (choice) void updateSettings({ outsideChecks: choice }).then(useManual)
          else void useManual()
        }}
      />
    </>
  )
}
