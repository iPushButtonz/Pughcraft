import { useState } from 'react'
import { Loader2, Play, RotateCw, Square } from 'lucide-react'
import { toast } from 'sonner'
import type { ServerSummary } from '@shared/servers'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { AudienceDialog } from '@/components/network/AudienceChooser'
import { EulaDialog } from '@/components/servers/EulaDialog'
import { useSettings } from '@/stores/settings'
import { t } from '@/strings'

/** Start / Stop / Restart for one server, showing only what makes sense right now. */
export function PowerButtons({
  server,
  size = 'default',
  showRestart = false
}: {
  server: ServerSummary
  size?: 'default' | 'sm'
  showRestart?: boolean
}) {
  const eulaAccepted = useSettings((s) => !!s.settings?.eulaAcceptedAt)
  const [busy, setBusy] = useState(false)
  const [askingAudience, setAskingAudience] = useState(false)
  const [askingEula, setAskingEula] = useState(false)
  const id = server.config.id
  const run = (action: () => Promise<void>) => async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setBusy(true)
    try {
      await action()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const { status } = server
  if (status === 'installing') return null
  const canStart = (status === 'stopped' || status === 'crashed') && server.config.installed
  const canStop = status === 'running' || status === 'starting'
  const needsAudience = (server.config.network?.audience ?? 'unset') === 'unset'

  // First start asks, in order: the Minecraft EULA (if never agreed), then who's going to play.
  const startFlow = (eulaOk = eulaAccepted): void => {
    if (!eulaOk) setAskingEula(true)
    else if (needsAudience) setAskingAudience(true)
    else void run(() => api.servers.start(id))()
  }

  return (
    <div className="flex items-center gap-2">
      {canStart && (
        <Button
          size={size}
          onClick={(e) => {
            e.stopPropagation()
            startFlow()
          }}
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Play />}
          {t.servers.start}
        </Button>
      )}
      <div onClick={(e) => e.stopPropagation()} className="contents">
        <EulaDialog
          open={askingEula}
          onOpenChange={setAskingEula}
          onAgreed={() => {
            setAskingEula(false)
            startFlow(true)
          }}
        />
        <AudienceDialog
          open={askingAudience}
          onOpenChange={setAskingAudience}
          onChoose={(choice) => {
            setAskingAudience(false)
            setBusy(true)
            api.network
              .setAudience(id, choice)
              .then(() => api.servers.start(id))
              .catch((err) => toast.error(errorMessage(err)))
              .finally(() => setBusy(false))
          }}
        />
      </div>
      {canStop && showRestart && status === 'running' && (
        <Button size={size} variant="outline" onClick={run(() => api.servers.restart(id))} disabled={busy}>
          <RotateCw />
          {t.servers.restart}
        </Button>
      )}
      {canStop && (
        <Button size={size} variant="outline" onClick={run(() => api.servers.stop(id))} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Square />}
          {t.servers.stop}
        </Button>
      )}
      {status === 'stopping' && (
        <Button size={size} variant="outline" disabled>
          <Loader2 className="animate-spin" />
          {t.servers.status.stopping}
        </Button>
      )}
    </div>
  )
}
