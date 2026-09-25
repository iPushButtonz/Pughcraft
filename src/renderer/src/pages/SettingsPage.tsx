import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FolderInput, FolderOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { APP_NAME, LICENSE_NAME, MOJANG_DISCLAIMER, REPO_URL } from '@shared/brand'
import type { AppInfo, FolderKind, LibraryCheck, LibraryInfo } from '@shared/ipc'
import { formatBytes } from '@shared/format'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useServers } from '@/stores/servers'
import { errorMessage } from '@/lib/errors'
import type { CloseBehavior, ThemeSetting } from '@shared/settings'
import type { OutsideChecks } from '@shared/network'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Segmented } from '@/components/Segmented'
import { SettingRow, SettingSection } from '@/components/SettingRow'
import { useIsAdvanced, useSettings } from '@/stores/settings'
import { api } from '@/lib/api'
import { t } from '@/strings'

function FolderRow({ label, path, kind }: { label: string; path: string; kind: FolderKind }) {
  return (
    <SettingRow
      label={label}
      hint={
        <span data-selectable className="font-mono text-xs break-all">
          {path}
        </span>
      }
    >
      <Button variant="outline" size="sm" onClick={() => void api.app.openFolder(kind)}>
        <FolderOpen />
        {t.settings.openFolder}
      </Button>
    </SettingRow>
  )
}

/** Advanced: move servers, Java and downloads to another folder or drive. */
function LibraryMoveRow() {
  const [check, setCheck] = useState<LibraryCheck | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const anyRunning = useServers((s) => Object.values(s.servers).some((x) => x.status !== 'stopped' && x.status !== 'crashed'))
  const problem = check && (check.same ? t.library.same : check.inside ? t.library.inside : check.freeBytes !== null && check.freeBytes < check.neededBytes * 1.05 ? t.library.noSpace : null)

  return (
    <SettingRow label={t.library.title} hint={anyRunning ? t.library.stopFirst : t.library.hint}>
      <Button
        variant="outline"
        size="sm"
        disabled={anyRunning || busy}
        onClick={async () => {
          const picked = await api.library.pick()
          if (!picked) return
          setBusy(true)
          try {
            setFolder(picked)
            setCheck(await api.library.check(picked))
          } catch (err) {
            toast.error(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <FolderInput />}
        {busy ? t.library.checking : t.library.move}
      </Button>
      <AlertDialog open={!!check} onOpenChange={(o) => !o && setCheck(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.library.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {check && <p>{t.library.confirmBody(check.target, formatBytes(check.neededBytes))}</p>}
                {check?.cloud && <p className="rounded-md border border-warning/50 bg-warning/10 p-2 text-foreground">{t.library.cloudWarning}</p>}
                {navigator.userAgent.includes('Windows') && <p>{t.library.firewallNote}</p>}
                {problem && <p className="font-medium text-destructive">{problem}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.create.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!problem}
              onClick={() =>
                folder &&
                void api.library
                  .move(folder)
                  .then(() => toast.info(t.library.moving))
                  .catch((err) => toast.error(errorMessage(err)))
              }
            >
              {t.library.moveConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingRow>
  )
}

export function SettingsPage() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const advanced = useIsAdvanced()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [library, setLibrary] = useState<LibraryInfo | null>(null)
  const serverMap = useServers((s) => s.servers)
  const servers = useMemo(
    () => Object.values(serverMap).sort((a, b) => a.config.createdAt.localeCompare(b.config.createdAt)),
    [serverMap]
  )

  useEffect(() => {
    void api.app.info().then(setInfo)
    void api.library.info().then(setLibrary)
  }, [])

  if (!settings) return null

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-10">
      <SettingSection title={t.settings.general}>
        <SettingRow label={t.settings.closeWindow} stacked>
          <RadioGroup
            value={settings.closeBehavior}
            onValueChange={(v) => void update({ closeBehavior: v as CloseBehavior })}
            className="gap-3"
          >
            {(
              [
                ['keep-running', t.settings.closeKeepRunning, t.settings.closeKeepRunningHint],
                ['stop-and-quit', t.settings.closeStopAndQuit, t.settings.closeStopAndQuitHint]
              ] as const
            ).map(([value, label, hint]) => (
              <div key={value} className="flex items-start gap-3">
                <RadioGroupItem value={value} id={`close-${value}`} className="mt-0.5" />
                <Label htmlFor={`close-${value}`} className="block space-y-0.5 font-normal">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-sm text-muted-foreground">{hint}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </SettingRow>
        {advanced && (
          <SettingRow
            label={t.settings.preventSleep}
            hint={t.settings.preventSleepHint}
            htmlFor="prevent-sleep"
          >
            <Switch
              id="prevent-sleep"
              checked={settings.preventSleep}
              onCheckedChange={(v) => void update({ preventSleep: v })}
            />
          </SettingRow>
        )}
      </SettingSection>

      <SettingSection title={t.autoStart.title}>
        <SettingRow
          label={t.autoStart.withComputer}
          hint={settings.startAtLogin ? t.autoStart.withComputerOn : t.autoStart.withComputerOff}
          htmlFor="start-at-login"
        >
          <Switch id="start-at-login" checked={settings.startAtLogin} onCheckedChange={(v) => void update({ startAtLogin: v })} />
        </SettingRow>
        <SettingRow label={t.autoStart.servers} hint={t.autoStart.serversHint} stacked>
          {servers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.autoStart.none}</p>
          ) : (
            <ul className="space-y-2">
              {servers.map((s) => (
                <li key={s.config.id} className="flex items-center gap-3">
                  <Checkbox
                    id={`auto-${s.config.id}`}
                    checked={!!s.config.autoStart}
                    disabled={!s.config.installed}
                    onCheckedChange={(v) =>
                      void api.servers.setAutoStart(s.config.id, v === true).catch((err) => toast.error(errorMessage(err)))
                    }
                  />
                  <Label htmlFor={`auto-${s.config.id}`} className="font-normal">
                    {s.config.name}
                  </Label>
                </li>
              ))}
            </ul>
          )}
        </SettingRow>
      </SettingSection>

      <SettingSection title={t.settings.privacy}>
        <SettingRow label={t.settings.outsideChecks} hint={t.settings.outsideChecksHint} stacked>
          <Segmented<OutsideChecks>
            label={t.settings.outsideChecks}
            value={settings.outsideChecks}
            options={[
              { value: 'ask', label: t.settings.outsideAsk },
              { value: 'on-demand', label: t.settings.outsideOnDemand },
              { value: 'never', label: t.settings.outsideNever }
            ]}
            onChange={(v) => void update({ outsideChecks: v })}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title={t.settings.appearance}>
        <SettingRow label={t.settings.theme}>
          <Segmented<ThemeSetting>
            label={t.settings.theme}
            value={settings.theme}
            options={[
              { value: 'system', label: t.settings.themeSystem },
              { value: 'light', label: t.settings.themeLight },
              { value: 'dark', label: t.settings.themeDark }
            ]}
            onChange={(v) => void update({ theme: v })}
          />
        </SettingRow>
      </SettingSection>

      {info && (
        <SettingSection title={t.settings.storage}>
          <FolderRow label={t.settings.library} path={info.paths.library} kind="library" />
          {library?.cloud && <p className="pb-4 text-sm text-warning">{t.library.currentCloud}</p>}
          {advanced && <LibraryMoveRow />}
        </SettingSection>
      )}

      {advanced && (
        <SettingSection title={t.files.tab}>
          <SettingRow
            label={t.editFiles.title}
            hint={settings.editFilesWhileRunning ? t.editFiles.on : t.editFiles.off}
            htmlFor="edit-files-running"
          >
            <Switch
              id="edit-files-running"
              checked={settings.editFilesWhileRunning}
              onCheckedChange={(v) => void update({ editFilesWhileRunning: v })}
            />
          </SettingRow>
        </SettingSection>
      )}

      {info && advanced && (
        <SettingSection title={t.settings.diagnostics}>
          <FolderRow label={t.settings.dataFolder} path={info.paths.dataRoot} kind="dataRoot" />
          <FolderRow label={t.settings.logsFolder} path={info.paths.logs} kind="logs" />
          <SettingRow label="Runtime">
            <span data-selectable className="font-mono text-xs text-muted-foreground">
              Electron {info.versions.electron} · Chrome {info.versions.chrome} · Node{' '}
              {info.versions.node} · {info.platform}
            </span>
          </SettingRow>
        </SettingSection>
      )}

      <SettingSection title={t.settings.about}>
        <SettingRow label={APP_NAME} hint={`${t.settings.version} ${info?.version ?? ''}`}>
          <Button variant="outline" size="sm" onClick={() => void api.app.openExternal(REPO_URL)}>
            <ExternalLink />
            {t.settings.sourceCode}
          </Button>
        </SettingRow>
        <div className="space-y-1 py-4 text-sm text-muted-foreground">
          <p>
            {t.settings.license} ({LICENSE_NAME}).
          </p>
          <p>{MOJANG_DISCLAIMER}</p>
        </div>
      </SettingSection>
    </div>
  )
}
