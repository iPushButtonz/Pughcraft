/**
 * Reads and writes Java `.properties` files (server.properties) without losing
 * comments, ordering or keys we don't know about.
 */

type Line = { kind: 'raw'; text: string } | { kind: 'entry'; key: string; value: string }

function unescape(text: string): string {
  return text.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_m, esc: string) => {
    if (esc.length === 5) return String.fromCharCode(parseInt(esc.slice(1), 16))
    return { t: '\t', n: '\n', r: '\r', f: '\f' }[esc] ?? esc
  })
}

function escape(text: string, isKey: boolean): string {
  let out = ''
  for (const [i, ch] of [...text].entries()) {
    const code = ch.codePointAt(0)!
    if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (isKey && (ch === '=' || ch === ':' || ch === ' ')) out += `\\${ch}`
    else if (!isKey && i === 0 && ch === ' ') out += '\\ '
    else if ((ch === '#' || ch === '!') && i === 0) out += `\\${ch}`
    else if (code > 0x7e || code < 0x20) {
      // \uXXXX works whether the server reads the file as UTF-8 or Latin-1.
      for (const unit of ch.split('')) out += `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`
    } else out += ch
  }
  return out
}

export class PropertiesFile {
  private constructor(private lines: Line[]) {}

  static parse(text: string): PropertiesFile {
    const lines: Line[] = []
    const physical = text.split(/\r?\n/)
    for (let i = 0; i < physical.length; i++) {
      let line = physical[i]
      const trimmed = line.trimStart()
      if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) {
        lines.push({ kind: 'raw', text: line })
        continue
      }
      // A trailing odd number of backslashes continues the value on the next line.
      while (/(^|[^\\])(\\\\)*\\$/.test(line) && i + 1 < physical.length) {
        line = line.slice(0, -1) + physical[++i].trimStart()
      }
      const body = line.trimStart()
      let keyEnd = 0
      while (keyEnd < body.length) {
        const ch = body[keyEnd]
        if (ch === '\\') keyEnd += 2
        else if (ch === '=' || ch === ':' || ch === ' ' || ch === '\t') break
        else keyEnd++
      }
      const key = unescape(body.slice(0, keyEnd))
      const rest = body.slice(keyEnd).replace(/^[ \t]*[=:]?[ \t]*/, '')
      lines.push({ kind: 'entry', key, value: unescape(rest) })
    }
    if (lines.length && lines[lines.length - 1].kind === 'raw' && (lines.at(-1) as { text: string }).text === '') {
      lines.pop()
    }
    return new PropertiesFile(lines)
  }

  static empty(): PropertiesFile {
    return new PropertiesFile([])
  }

  get(key: string): string | undefined {
    for (const l of this.lines) if (l.kind === 'entry' && l.key === key) return l.value
    return undefined
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  set(key: string, value: string): void {
    const existing = this.lines.find((l) => l.kind === 'entry' && l.key === key)
    if (existing && existing.kind === 'entry') existing.value = value
    else this.lines.push({ kind: 'entry', key, value })
  }

  toObject(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const l of this.lines) if (l.kind === 'entry') out[l.key] = l.value
    return out
  }

  serialize(): string {
    return (
      this.lines
        .map((l) => (l.kind === 'raw' ? l.text : `${escape(l.key, true)}=${escape(l.value, false)}`))
        .join('\n') + '\n'
    )
  }
}
