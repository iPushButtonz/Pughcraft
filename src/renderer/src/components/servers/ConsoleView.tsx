import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import type { ServerSummary } from '@shared/servers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useServers } from '@/stores/servers'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { t } from '@/strings'

function lineClass(text: string, source: string): string {
  if (source === 'app') return 'text-sky-400'
  if (/\bERROR\b|Exception|\bFATAL\b/.test(text)) return 'text-red-400'
  if (/\bWARN(ING)?\b/.test(text)) return 'text-amber-300'
  return 'text-neutral-200'
}

export function ConsoleView({ server }: { server: ServerSummary }) {
  const id = server.config.id
  const lines = useServers((s) => s.consoles[id])
  const loadConsole = useServers((s) => s.loadConsole)
  const [input, setInput] = useState('')
  const history = useRef<string[]>([])
  const historyPos = useRef(-1)
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const running = server.status === 'running' || server.status === 'starting'

  useEffect(() => {
    void loadConsole(id)
  }, [id, loadConsole])

  // Follow new output, unless the user scrolled up to read something.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text) return
    history.current = [text, ...history.current.filter((h) => h !== text)].slice(0, 50)
    historyPos.current = -1
    setInput('')
    try {
      await api.servers.command(id, text)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') void send()
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = historyPos.current + (e.key === 'ArrowUp' ? 1 : -1)
      if (next < -1 || next >= history.current.length) return
      historyPos.current = next
      setInput(next === -1 ? '' : history.current[next])
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div
        ref={scroller}
        data-selectable
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-neutral-950 p-3 font-mono text-xs leading-relaxed"
      >
        {(lines ?? []).map((l) => (
          <div key={l.seq} className={cn('break-all whitespace-pre-wrap', lineClass(l.text, l.source))}>
            {l.text || ' '}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          disabled={!running}
          placeholder={running ? t.console.placeholder : t.console.notRunning}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          className="font-mono"
        />
        <Button onClick={() => void send()} disabled={!running || !input.trim()}>
          <SendHorizontal />
          {t.console.send}
        </Button>
      </div>
    </div>
  )
}
