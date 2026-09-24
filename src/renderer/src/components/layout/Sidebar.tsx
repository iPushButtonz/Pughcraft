import { Server, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import { cn } from 'cn'
import { APP_NAME } from '@shared/brand'
import { Logo } from '@/components/Logo'
import { useNav, type Page } from '@/stores/nav'
import { t } from '@/strings'

const items: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'servers', label: t.nav.servers, icon: Server }
]

function NavButton({ page, label, icon: Icon }: { page: Page; label: string; icon: LucideIcon }) {
  const current = useNav((s) => s.page)
  const go = useNav((s) => s.go)
  // A server's dashboard lives under My Servers.
  const active = current === page || (page === 'servers' && current === 'server')
  return (
    <button
      type="button"
      onClick={() => go(page as Exclude<Page, 'server'>)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
        active && 'bg-sidebar-accent text-sidebar-foreground'
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}

export function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-6">
        <Logo className="size-8" />
        <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2">
        {items.map((item) => (
          <NavButton key={item.page} {...item} />
        ))}
      </nav>
      <div className="px-2 pb-3">
        <NavButton page="settings" label={t.nav.settings} icon={SettingsIcon} />
      </div>
    </aside>
  )
}
