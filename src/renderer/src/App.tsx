import { useEffect } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { ModeSwitch } from '@/components/layout/ModeSwitch'
import { TaskTray } from '@/components/TaskTray'
import { useResolvedTheme } from '@/hooks/use-resolved-theme'
import { useNav, type Page } from '@/stores/nav'
import { useSettings } from '@/stores/settings'
import { ServersPage } from '@/pages/ServersPage'
import { ServerPage } from '@/pages/ServerPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { t } from '@/strings'

const titles: Record<Page, string> = {
  servers: t.servers.title,
  server: t.servers.title,
  settings: t.settings.title
}

export function App() {
  const loaded = useSettings((s) => s.settings !== null)
  const load = useSettings((s) => s.load)
  const page = useNav((s) => s.page)
  const serverId = useNav((s) => s.serverId)
  const theme = useResolvedTheme()

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  if (!loaded) return null

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
          <h1 className="text-lg font-semibold tracking-tight">{titles[page]}</h1>
          <ModeSwitch />
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
          {page === 'servers' && <ServersPage />}
          {page === 'server' && serverId && <ServerPage key={serverId} id={serverId} />}
          {page === 'settings' && <SettingsPage />}
        </div>
      </main>
      <TaskTray />
    </div>
  )
}
