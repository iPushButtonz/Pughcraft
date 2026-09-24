import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { useSettings } from '@/stores/settings'
import { api } from '@/lib/api'
import { t } from '@/strings'

const EULA_URL = 'https://aka.ms/MinecraftEULA'

/** Shown before a server's first start when the Minecraft EULA hasn't been agreed to (never pre-ticked). */
export function EulaDialog({
  open,
  onOpenChange,
  onAgreed
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAgreed: () => void
}) {
  const update = useSettings((s) => s.update)
  const [ticked, setTicked] = useState(false)
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setTicked(false)
        onOpenChange(o)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.eula.title}</AlertDialogTitle>
          <AlertDialogDescription>{t.eula.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
          <Checkbox checked={ticked} onCheckedChange={(v) => setTicked(v === true)} className="mt-0.5" />
          <span>
            {t.create.eula}{' '}
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
              onClick={(e) => {
                e.preventDefault()
                void api.app.openExternal(EULA_URL)
              }}
            >
              {t.create.eulaLink}
              <ExternalLink className="size-3" />
            </button>
            .
          </span>
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.create.cancel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ticked}
            onClick={() =>
              void update({ eulaAcceptedAt: new Date().toISOString() }).then(() => {
                setTicked(false)
                onAgreed()
              })
            }
          >
            {t.eula.agree}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
