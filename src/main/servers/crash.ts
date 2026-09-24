/** Turns the last console lines of a crashed server into one plain-English reason. */
export function explainCrash(tail: string[], port: number): string {
  const text = tail.join('\n')
  const rules: [RegExp, string][] = [
    [
      /FAILED TO BIND TO PORT|Address already in use|BindException/i,
      `Another program is already using port ${port}. Close it, or give this server a different port in Settings (Advanced).`
    ],
    [
      /Could not reserve enough space for object heap|Invalid maximum heap size|Initial heap size set to a larger value/i,
      'The server asked for more memory than this PC can give it. Lower the memory in Settings.'
    ],
    [/OutOfMemoryError/i, 'The server ran out of memory. Give it more memory in Settings.'],
    [
      /UnsupportedClassVersionError|has been compiled by a more recent version/i,
      'The server needs a newer version of Java than the one selected. Switch Java back to Automatic in Settings (Advanced).'
    ],
    [/You need to agree to the EULA/i, 'The Minecraft EULA has not been accepted for this server.'],
    [
      /Unrecognized VM option|Could not create the Java Virtual Machine/i,
      "One of the Java settings isn't supported by this Java version. Check the JVM arguments in Settings (Advanced)."
    ],
    [
      /Failed to load level|Exception reading .*level\.dat|Corrupted chunk/i,
      'The world could not be loaded; it may be damaged. Restoring a backup usually fixes this.'
    ]
  ]
  for (const [pattern, reason] of rules) if (pattern.test(text)) return reason
  return 'The server stopped unexpectedly. Open the Console tab to see its last messages.'
}
