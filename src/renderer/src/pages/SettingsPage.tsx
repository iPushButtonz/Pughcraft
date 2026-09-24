import { useEffect, useState } from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import { APP_NAME, LICENSE_NAME, MOJANG_DISCLAIMER, REPO_URL } from '@shared/brand'
import type { AppInfo, FolderKind } from '@shared/ipc'
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

export function SettingsPage() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const advanced = useIsAdvanced()
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void api.app.info().then(setInfo)
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
        <SettingRow
          label={t.settings.startAtLogin}
          hint={t.settings.startAtLoginHint}
          htmlFor="start-at-login"
        >
          <Switch
            id="start-at-login"
            checked={settings.startAtLogin}
            onCheckedChange={(v) => void update({ startAtLogin: v })}
          />
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
