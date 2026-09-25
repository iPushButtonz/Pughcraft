import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { t } from '@/strings'

/** Asks for one line of text (a name, a new folder, ...). */
export function PromptDialog({
  open,
  title,
  description,
  label,
  initial = '',
  confirm,
  onSubmit,
  onClose
}: {
  open: boolean
  title: string
  description?: string
  label: string
  initial?: string
  confirm: string
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    if (open) setValue(initial)
  }, [open, initial])
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!value.trim()) return
            onSubmit(value.trim())
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <Input autoFocus aria-label={label} placeholder={label} value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t.create.cancel}
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              {confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
