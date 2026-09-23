import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Segmented } from '@/components/Segmented'
import { useSettings } from '@/stores/settings'
import type { UiMode } from '@shared/settings'
import { t } from '@/strings'

const options = [
  { value: 'simple', label: t.mode.simple },
  { value: 'advanced', label: t.mode.advanced }
] as const satisfies readonly { value: UiMode; label: string }[]

/** The one app-wide Simple / Advanced switch. */
export function ModeSwitch() {
  const mode = useSettings((s) => s.settings?.mode ?? 'simple')
  const update = useSettings((s) => s.update)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <Segmented<UiMode>
            label="Simple or Advanced mode"
            value={mode}
            options={options}
            onChange={(v) => void update({ mode: v })}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        {t.mode.hint}
      </TooltipContent>
    </Tooltip>
  )
}
