import { useState } from 'react'
import { Cable } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { t } from '@/strings'

const n = t.network

/**
 * Explains the third-party tunnel once (before the first link), then sets it up.
 * Progress shows in the task tray; the Network tab updates when the address is ready.
 */
export async function startTunnel(serverId: string): Promise<void> {
  try {
    await api.network.useTunnel(serverId)
  } catch (err) {
    toast.error(errorMessage(err))
  }
}

export function useTunnelConfirm(serverId: string): { ask: () => Promise<void>; dialog: React.ReactNode } {
  const [open, setOpen] = useState(false)
  const ask = async (): Promise<void> => {
    const status = await api.network.playitStatus()
    if (status.linked) await startTunnel(serverId)
    else setOpen(true)
  }
  const dialog = (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{n.tunnelTitle}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-left">
            <span className="block">{n.tunnelBody}</span>
            <span className="block">{n.tunnelLinkOnce}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.create.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void startTunnel(serverId)}>{n.tunnelContinue}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { ask, dialog }
}

export function TunnelButton({ serverId, size = 'sm' }: { serverId: string; size?: 'sm' | 'default' }) {
  const { ask, dialog } = useTunnelConfirm(serverId)
  return (
    <>
      <Button size={size} onClick={() => void ask()}>
        <Cable />
        {n.useTunnel}
      </Button>
      {dialog}
    </>
  )
}
