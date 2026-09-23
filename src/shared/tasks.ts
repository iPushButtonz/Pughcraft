export type TaskStatus = 'running' | 'done' | 'failed' | 'cancelled'

/** What the UI sees of a long-running job (download, extract, install, backup...). */
export interface TaskSnapshot {
  id: string
  title: string
  status: TaskStatus
  /** Current step in plain words, e.g. "Downloading Java 21". */
  step: string | null
  /** 0..1, or null when the amount of work is unknown. */
  progress: number | null
  /** Extra detail such as "34.2 MB of 120 MB". */
  detail: string | null
  error: string | null
  cancellable: boolean
  startedAt: number
  endedAt: number | null
}
