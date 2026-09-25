import { useEffect } from 'react'
import { toast } from 'sonner'
import { useServers } from '@/stores/servers'
import { api } from '@/lib/api'
import { t } from '@/strings'
import { playerAction } from './PlayersPanel'

const p = t.players

/** A short, friendly two-note chime, made on the fly so no sound file ships with the app. */
function chime(): void {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    for (const [i, freq] of [660, 880].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = now + i * 0.14
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.4)
    }
    setTimeout(() => void ctx.close(), 1000)
  } catch {
    // No audio device: the popup still shows.
  }
}

/** "Alex tried to join. Allow?" popups, shown inside the app only (owner's choice). */
export function JoinRequests() {
  useEffect(
    () =>
      api.players.onRequest((req) => {
        const server = useServers.getState().servers[req.serverId]?.config.name ?? ''
        chime()
        toast(p.requestToast(req.name, server), {
          id: `join-${req.serverId}-${req.name.toLowerCase()}`,
          description: p.requestToastBody,
          duration: 60_000,
          action: {
            label: p.allow,
            onClick: () =>
              void playerAction(req.serverId, 'whitelist-add', req.name).then((ok) => ok && toast.success(p.allowed(req.name)))
          },
          cancel: { label: p.ignore, onClick: () => void api.players.dismissRequest(req.serverId, req.name) }
        })
      }),
    []
  )
  return null
}
