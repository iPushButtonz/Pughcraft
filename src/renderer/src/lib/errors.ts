/** Strips Electron's "Error invoking remote method 'x': Error:" prefix from IPC failures. */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}
