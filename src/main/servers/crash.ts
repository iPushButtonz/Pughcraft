/** Turns the last console lines of a crashed server into one plain-English reason. */
export function explainCrash(tail: string[], port: number): string {
  const text = tail.join('\n')

  // Mod problems first: they're the most common reason a modded server won't start,
  // and naming the mod is what makes the message useful.
  const fabricMissing = /Mod '([^']+)' \([^)]*\)[^\n]* requires (?:version [^\n]*? of |any version of )?(?:mod )?'?([^',\n!]+?)'?,? which is missing/i.exec(text)
  if (fabricMissing) {
    return `The mod ${fabricMissing[1]} needs ${fabricMissing[2]}, which isn't installed. Add it to the server's mods folder.`
  }
  const forgeMissing = /Mod ID: '([^']+)', Requested by: '([^']+)'/i.exec(text)
  if (forgeMissing) {
    return `The mod ${forgeMissing[2]} needs ${forgeMissing[1]} (or a different version of it). Add or update it in the server's mods folder.`
  }
  const fabricWrongVersion = /Mod '([^']+)' \([^)]*\)[^\n]* requires version ([^\n]+?) of (?:mod )?'?([^',\n]+)'?, but only the wrong version is present/i.exec(text)
  if (fabricWrongVersion) {
    return `The mod ${fabricWrongVersion[1]} needs ${fabricWrongVersion[3]} version ${fabricWrongVersion[2]}. Update ${fabricWrongVersion[3]} on the server.`
  }
  if (/Duplicate mods? found|Found duplicate mods|Duplicate mod id/i.test(text)) {
    return 'Two copies of the same mod are installed. Remove the older one from the mods folder.'
  }
  if (/is a Fabric mod|Found Fabric mods? in a (?:Neo)?Forge|contains no (?:Neo)?Forge mods|Mod file .* is not a (?:neo)?forge mod/i.test(text)) {
    return "A mod made for a different mod loader is installed (for example a Fabric mod on a Forge server). Remove it or switch the server's type."
  }
  if (/Attempted to load class net\/minecraft\/client\/|invalid dist DEDICATED_SERVER|in environment type SERVER/i.test(text)) {
    return "A mod that only works inside the game (not on servers) is installed. Pughcraft couldn't tell which one; check the Console for the mod's name and move it out of the mods folder."
  }

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
      'The server (or one of its mods) needs a newer version of Java than the one selected. Switch Java back to Automatic in Settings (Advanced).'
    ],
    [/You need to agree to the EULA/i, 'The Minecraft EULA has not been accepted for this server.'],
    [
      /Unrecognized VM option|Could not create the Java Virtual Machine/i,
      "One of the Java settings isn't supported by this Java version. Check the JVM arguments in Settings (Advanced)."
    ],
    [
      /Failed to load level|Exception reading .*level\.dat|Corrupted chunk/i,
      'The world could not be loaded; it may be damaged. Restoring a backup usually fixes this.'
    ],
    [
      /This world was saved with a newer version|trying to load a world from a newer version|downgrad/i,
      'This world was saved by a newer Minecraft version than the server runs. Use the same version (or newer) for the server.'
    ]
  ]
  for (const [pattern, reason] of rules) if (pattern.test(text)) return reason
  return 'The server stopped unexpectedly. Open the Console tab to see its last messages.'
}
