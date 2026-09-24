import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { LOADER_LABELS, type ServerSummary } from '@shared/servers'
import { Button } from '@/components/ui/button'
import { useServerNetwork } from '@/components/network/NetworkPanel'
import { t } from '@/strings'

/** Copies a ready-to-paste invite with the best address for the chosen audience. */
export function ShareButton({ server }: { server: ServerSummary }) {
  const view = useServerNetwork(server.config.id)
  if (!view) return null
  const c = server.config
  const audience = view.config.audience
  const address =
    (audience === 'internet' && view.addresses.internet) ||
    ((audience === 'internet' || audience === 'lan') && view.addresses.lan) ||
    view.addresses.thisPc
  const version = `Minecraft ${c.mcVersion} (${LOADER_LABELS[c.loader]}${c.loader !== 'vanilla' && c.loaderVersion ? ` ${c.loaderVersion}` : ''})`

  return (
    <Button
      variant="outline"
      onClick={() => {
        void navigator.clipboard.writeText(t.network.shareText(c.name, address, version))
        toast.success(t.network.shared)
      }}
    >
      <Share2 />
      {t.network.share}
    </Button>
  )
}
