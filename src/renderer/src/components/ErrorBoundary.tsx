import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/** Keeps one broken screen from blanking the whole app; servers keep running regardless. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <h2 className="text-lg font-semibold">This screen hit a problem</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Your servers are not affected. Reloading the window usually fixes it.
        </p>
        <pre data-selectable className="max-w-xl overflow-auto rounded bg-muted p-2 text-left text-xs">
          {this.state.error.message}
        </pre>
        <Button onClick={() => location.reload()}>Reload window</Button>
      </div>
    )
  }
}
