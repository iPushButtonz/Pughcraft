import { useState } from 'react'
import { CheckCircle2, CircleAlert, CircleX, Loader2, MinusCircle, Stethoscope, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import type { DoctorFix, DoctorReport } from '@shared/network'
import type { ServerSummary } from '@shared/servers'
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
import { useSettings } from '@/stores/settings'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { t } from '@/strings'

const n = t.network

const statusIcon = {
  pass: <CheckCircle2 className="size-4 text-success" />,
  fail: <CircleX className="size-4 text-destructive" />,
  warn: <TriangleAlert className="size-4 text-warning" />,
  skip: <MinusCircle className="size-4 text-muted-foreground" />
}

/** Asks once whether the Doctor may use outside services, recommending "when I run it". */
export function OutsideConsent({ open, onDecide }: { open: boolean; onDecide: (choice: 'on-demand' | 'never' | null) => void }) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{n.consentTitle}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-left">
            <span className="block">{n.consentBody}</span>
            <span className="block">{n.consentWithout}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
          <AlertDialogAction onClick={() => onDecide('on-demand')}>
            {n.consentYes} ({n.consentYesHint})
          </AlertDialogAction>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel onClick={() => onDecide(null)}>{n.consentNotNow}</AlertDialogCancel>
            <AlertDialogCancel onClick={() => onDecide('never')}>{n.consentNever}</AlertDialogCancel>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function DoctorCard({
  server,
  onFix
}: {
  server: ServerSummary
  onFix: (fix: DoctorFix) => Promise<void>
}) {
  const outside = useSettings((s) => s.settings?.outsideChecks ?? 'ask')
  const updateSettings = useSettings((s) => s.update)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<DoctorReport | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [asking, setAsking] = useState(false)

  const run = async (): Promise<void> => {
    setRunning(true)
    try {
      setReport(await api.network.doctor(server.config.id))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  const start = (): void => {
    if (outside === 'ask' && server.config.network?.audience === 'internet') setAsking(true)
    else void run()
  }

  const v = report?.verdict
  const fixLabel = v?.fix ? n.fix[v.fix] : null

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Stethoscope className="size-4" />
            {n.doctor}
          </h3>
          <p className="text-sm text-muted-foreground">{n.doctorHint}</p>
        </div>
        <Button variant={report ? 'outline' : 'default'} onClick={start} disabled={running}>
          {running && <Loader2 className="animate-spin" />}
          {report ? n.rerun : n.runDoctor}
        </Button>
      </div>

      {v && (
        <div
          className={cn(
            'space-y-2 rounded-lg border p-4',
            v.level === 'ok' && 'border-success/40 bg-success/10',
            v.level === 'warning' && 'border-warning/50 bg-warning/10',
            v.level === 'problem' && 'border-destructive/40 bg-destructive/10'
          )}
        >
          <p className="flex items-center gap-2 font-semibold">
            {v.level === 'ok' ? (
              <CheckCircle2 className="size-5 text-success" />
            ) : v.level === 'warning' ? (
              <CircleAlert className="size-5 text-warning" />
            ) : (
              <CircleX className="size-5 text-destructive" />
            )}
            {v.title}
          </p>
          <p data-selectable className="text-sm">
            {v.body}
          </p>
          <div className="flex items-center gap-2 pt-1">
            {v.fix && fixLabel && (
              <Button
                size="sm"
                onClick={async () => {
                  await onFix(v.fix!)
                  void run()
                }}
              >
                {fixLabel}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowDetails((s) => !s)}>
              {showDetails ? n.hideDetails : n.details}
            </Button>
          </div>
          {showDetails && (
            <ul className="space-y-1.5 border-t pt-3">
              {report.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5">{statusIcon[c.status]}</span>
                  <span>
                    <span className="font-medium">{c.label}.</span>{' '}
                    <span data-selectable className="text-muted-foreground">
                      {c.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <OutsideConsent
        open={asking}
        onDecide={(choice) => {
          setAsking(false)
          if (choice) void updateSettings({ outsideChecks: choice }).then(run)
          else void run()
        }}
      />
    </section>
  )
}
