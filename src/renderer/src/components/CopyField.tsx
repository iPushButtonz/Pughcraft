import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/strings'

/** A value shown in monospace with a one-click Copy button. */
export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 py-1.5 pr-1.5 pl-3">
      <span data-selectable className="flex-1 truncate font-mono text-sm">
        {value}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? t.dashboard.copied : t.dashboard.copy}
      </Button>
    </div>
  )
}
