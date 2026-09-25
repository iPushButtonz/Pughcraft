/**
 * Every server.properties key Pughcraft knows about, so each one gets a real control.
 * Keys the file has that aren't listed here still show up in the Advanced text editor.
 * Each key carries a one-line description of what its current value does.
 */

export type PropertySection = 'world' | 'gameplay' | 'players' | 'performance' | 'network' | 'chat' | 'resourcePack' | 'remote' | 'other'

export const PROPERTY_SECTIONS: Record<PropertySection, string> = {
  world: 'World',
  gameplay: 'Gameplay',
  players: 'Players',
  performance: 'Performance',
  network: 'Network and security',
  chat: 'Server list',
  resourcePack: 'Resource pack',
  remote: 'Query and RCON',
  other: 'Other'
}

interface Base {
  key: string
  label: string
  section: PropertySection
  /** Only shown when the file has it (the key was removed or added in some versions). */
  optional?: boolean
}
/** int/text: `about` describes the value ({v} = the value); `special` overrides it for exact values like "0" or "". */
interface Described {
  about?: string
  special?: Record<string, string>
}
export type PropertyDef =
  | (Base & { type: 'bool'; default: boolean; on: string; off: string })
  | (Base & Described & { type: 'int'; default: number; min: number; max: number })
  | (Base & Described & { type: 'text'; default: string; secret?: boolean; wide?: boolean })
  | (Base & { type: 'enum'; default: string; options: { value: string; label: string; about: string }[] })

const bool = (key: string, label: string, section: PropertySection, def: boolean, on: string, off: string, optional = false): PropertyDef => ({
  key, label, section, type: 'bool', default: def, on, off, optional
})
const int = (
  key: string, label: string, section: PropertySection, def: number, min: number, max: number,
  about: string, special: Record<string, string> = {}, optional = false
): PropertyDef => ({ key, label, section, type: 'int', default: def, min, max, about, special, optional })
const text = (
  key: string, label: string, section: PropertySection, def: string, about: string,
  extra: { special?: Record<string, string>; secret?: boolean; wide?: boolean; optional?: boolean } = {}
): PropertyDef => ({ key, label, section, type: 'text', default: def, about, ...extra })
const opts = (...values: [string, string, string][]): { value: string; label: string; about: string }[] =>
  values.map(([value, label, about]) => ({ value, label, about }))

export const PROPERTY_DEFS: PropertyDef[] = [
  // World
  text('level-name', 'World folder name', 'world', 'world', 'Loads the world in the “{v}” folder'),
  text('level-seed', 'Seed', 'world', '', 'New terrain uses seed “{v}”', { special: { '': 'Random seed' } }),
  {
    key: 'level-type', label: 'World type', section: 'world', type: 'enum', default: 'minecraft:normal',
    options: opts(
      ['minecraft:normal', 'Default', 'Standard terrain (new worlds only)'],
      ['minecraft:flat', 'Superflat', 'Flat layers from generator settings (new worlds only)'],
      ['minecraft:large_biomes', 'Large biomes', 'Biomes are 4× bigger (new worlds only)'],
      ['minecraft:amplified', 'Amplified', 'Extreme mountains, heavier on the PC (new worlds only)'],
      ['minecraft:single_biome_surface', 'Single biome', 'One biome everywhere (new worlds only)']
    )
  },
  text('generator-settings', 'Generator settings (JSON)', 'world', '{}', 'JSON for Superflat and Single biome', { wide: true }),
  bool('generate-structures', 'Generate structures', 'world', true, 'Villages, temples and strongholds generate', 'No structures in new chunks'),
  int('max-world-size', 'Maximum world size (radius)', 'world', 29999984, 1, 29999984, 'World border sits {v} blocks from the center'),
  bool('allow-nether', 'Allow the Nether', 'world', true, 'Nether portals work', 'Nether portals don’t work'),
  int('spawn-protection', 'Spawn protection radius', 'world', 16, 0, 1000, 'Only ops can build within {v} blocks of spawn', { '0': 'Anyone can build at spawn' }),
  bool('spawn-monsters', 'Spawn monsters', 'world', true, 'Monsters spawn', 'Monsters don’t spawn', true),
  bool('spawn-animals', 'Spawn animals', 'world', true, 'Animals spawn', 'Animals don’t spawn', true),
  bool('spawn-npcs', 'Spawn villagers', 'world', true, 'Villagers spawn', 'Villagers don’t spawn', true),

  // Gameplay
  {
    key: 'gamemode', label: 'Default game mode', section: 'gameplay', type: 'enum', default: 'survival',
    options: opts(
      ['survival', 'Survival', 'New players start in Survival'],
      ['creative', 'Creative', 'New players start in Creative'],
      ['adventure', 'Adventure', 'New players start in Adventure and can’t break blocks'],
      ['spectator', 'Spectator', 'New players start as spectators']
    )
  },
  bool('force-gamemode', 'Force game mode on join', 'gameplay', false, 'Players reset to the default mode on every join', 'Players keep their mode between visits'),
  {
    key: 'difficulty', label: 'Difficulty', section: 'gameplay', type: 'enum', default: 'easy',
    options: opts(
      ['peaceful', 'Peaceful', 'No hostile mobs and no hunger loss'],
      ['easy', 'Easy', 'Mobs deal less damage'],
      ['normal', 'Normal', 'Standard damage and hunger'],
      ['hard', 'Hard', 'Mobs hit harder and starving can kill']
    )
  },
  bool('hardcore', 'Hardcore', 'gameplay', false, 'Locked to Hard; dying makes you a spectator', 'Normal deaths and respawns'),
  bool('pvp', 'Player vs player (PvP)', 'gameplay', true, 'Players can hurt each other', 'Players can’t hurt each other', true),
  bool('allow-flight', 'Allow flying', 'gameplay', false, 'Flying in Survival won’t get players kicked', 'Flying in Survival gets players kicked'),
  bool('enable-command-block', 'Command blocks', 'gameplay', false, 'Command blocks run', 'Command blocks do nothing', true),
  int('player-idle-timeout', 'Kick idle players after (minutes)', 'gameplay', 0, 0, 100000, 'Idle players are kicked after {v} minutes', { '0': 'Idle players are never kicked', '1': 'Idle players are kicked after 1 minute' }),
  int('op-permission-level', 'Operator permission level', 'gameplay', 4, 0, 4, 'Ops get level {v}', {
    '0': 'Ops get no extra powers',
    '1': 'Ops can bypass spawn protection',
    '2': 'Ops can use cheats and command blocks',
    '3': 'Ops can also kick, ban and op players',
    '4': 'Ops can do everything, including /stop'
  }),
  int('function-permission-level', 'Function permission level', 'gameplay', 2, 1, 4, 'Data pack functions run at level {v}'),
  bool('broadcast-console-to-ops', 'Show console output to operators', 'gameplay', true, 'Ops see console commands in chat', 'Console commands stay out of chat'),
  bool('broadcast-rcon-to-ops', 'Show RCON output to operators', 'gameplay', true, 'Ops see RCON commands in chat', 'RCON commands stay out of chat'),

  // Players
  int('max-players', 'Maximum players', 'players', 20, 0, 2147483647, 'Up to {v} players at once', { '1': 'Only 1 player at a time' }),
  bool('white-list', 'Whitelist', 'players', false, 'Only whitelisted players can join', 'Anyone can join'),
  bool('enforce-whitelist', 'Kick players removed from whitelist', 'players', false, 'Removed players are kicked immediately', 'Removed players stay until they leave', true),

  // Performance
  int('view-distance', 'View distance (chunks)', 'performance', 10, 2, 32, 'Players see {v} chunks around them'),
  int('simulation-distance', 'Simulation distance (chunks)', 'performance', 10, 3, 32, 'Mobs, crops and redstone run within {v} chunks of players', {}, true),
  int('entity-broadcast-range-percentage', 'Entity broadcast range (%)', 'performance', 100, 10, 1000, 'Entities are visible at {v}% of normal range'),
  int('max-tick-time', 'Watchdog max tick time (ms)', 'performance', 60000, -1, 2147483647, 'The server stops if a tick takes over {v} ms', { '-1': 'Watchdog is off; a stuck tick never stops the server' }),
  int('network-compression-threshold', 'Network compression threshold (bytes)', 'performance', 256, -1, 2147483647, 'Packets over {v} bytes are compressed', { '-1': 'Nothing is compressed', '0': 'Everything is compressed' }),
  int('max-chained-neighbor-updates', 'Max chained neighbor updates', 'performance', 1000000, -1, 2147483647, 'Block update chains stop after {v}', { '-1': 'No limit on block update chains' }, true),
  int('rate-limit', 'Packet rate limit', 'performance', 0, 0, 2147483647, 'Players sending over {v} packets a second are kicked', { '0': 'No packet limit' }),
  int('pause-when-empty-seconds', 'Pause when empty after (seconds)', 'performance', 60, -1, 2147483647, 'The world pauses {v} seconds after the last player leaves', { '-1': 'The world never pauses', '0': 'The world pauses as soon as the last player leaves' }, true),
  bool('sync-chunk-writes', 'Synchronous chunk writes', 'performance', true, 'Safer saves if the PC crashes, but slower', 'Faster saves, riskier if the PC crashes'),
  bool('use-native-transport', 'Use native transport (Linux)', 'performance', true, 'Uses Linux networking (no effect on Windows)', 'Standard networking'),
  {
    key: 'region-file-compression', label: 'Region file compression', section: 'performance', type: 'enum', default: 'deflate', optional: true,
    options: opts(['deflate', 'Deflate', 'Standard compression'], ['lz4', 'LZ4', 'Faster, bigger files'], ['none', 'None', 'No compression, biggest files'])
  },

  // Network and security
  text('server-ip', 'Bind to IP', 'network', '', 'Listens only on {v}', { special: { '': 'Listens on all addresses' } }),
  int('server-port', 'Port', 'network', 25565, 1, 65535, 'Players connect on port {v}'),
  bool('online-mode', 'Verify players with Mojang (online mode)', 'network', true, 'Only real Minecraft accounts can join', 'Anyone can join with any name'),
  bool('enforce-secure-profile', 'Require signed chat', 'network', true, 'Chat must be signed by Mojang', 'Unsigned chat is allowed', true),
  bool('prevent-proxy-connections', 'Block VPN/proxy connections', 'network', false, 'VPN and proxy players are kicked', 'VPN and proxy players can join'),
  bool('accept-transfers', 'Accept transfers from other servers', 'network', false, 'Players can arrive via /transfer', 'Players sent with /transfer are refused', true),
  bool('hide-online-players', 'Hide player list from server list', 'network', false, 'Player names are hidden in the server list', 'Player names show in the server list', true),
  bool('log-ips', 'Log player IP addresses', 'network', true, 'Player IPs are logged', 'Player IPs aren’t logged', true),

  // Server list
  text('motd', 'Message of the day', 'chat', 'A Minecraft Server', 'Shown under the name in the server list. § for colour', { wide: true }),
  bool('enable-status', 'Show in the server list', 'chat', true, 'Shows in the server list', 'Shows as offline, but players can still join'),

  // Resource pack
  text('resource-pack', 'Resource pack URL', 'resourcePack', '', 'Offered to players when they join', { wide: true, special: { '': 'No resource pack' } }),
  text('resource-pack-sha1', 'Resource pack SHA-1', 'resourcePack', '', 'Forces a re-download when the pack changes', { wide: true }),
  text('resource-pack-id', 'Resource pack ID', 'resourcePack', '', 'Pack UUID', { optional: true }),
  text('resource-pack-prompt', 'Resource pack prompt', 'resourcePack', '', 'Message in the download prompt', { wide: true, optional: true }),
  bool('require-resource-pack', 'Require the resource pack', 'resourcePack', false, 'Declining the pack disconnects players', 'Players can decline the pack'),

  // Query and RCON
  bool('enable-query', 'Enable query', 'remote', false, 'Server-list sites can query status', 'Query is off'),
  int('query.port', 'Query port', 'remote', 25565, 1, 65535, 'Query listens on UDP {v}'),
  bool('enable-rcon', 'Enable RCON', 'remote', false, 'Remote console is on', 'Remote console is off'),
  int('rcon.port', 'RCON port', 'remote', 25575, 1, 65535, 'RCON listens on TCP {v}'),
  text('rcon.password', 'RCON password', 'remote', '', 'Unencrypted; don’t open the RCON port', { secret: true, special: { '': 'Set a password to use RCON' } }),

  // Other
  text('initial-enabled-packs', 'Data packs enabled at creation', 'other', 'vanilla', 'Enabled in new worlds, comma-separated', { wide: true, optional: true }),
  text('initial-disabled-packs', 'Data packs disabled at creation', 'other', '', 'Disabled in new worlds, comma-separated', { wide: true, optional: true }),
  text('text-filtering-config', 'Text filtering config', 'other', '', 'Unused by vanilla', { optional: true }),
  text('bug-report-link', 'Bug report link', 'other', '', 'Shown on the disconnect screen', { optional: true }),
  bool('enable-jmx-monitoring', 'Enable JMX monitoring', 'other', false, 'Stats are exposed to Java tools', 'JMX is off'),
  bool('debug', 'Debug logging', 'other', false, 'Extra log output', 'Normal logging', true)
]

/** One line saying what the setting does at this value. */
export function describeProperty(def: PropertyDef, value: string): string {
  const v = value.trim()
  if (def.type === 'bool') return v.toLowerCase() === 'true' ? def.on : def.off
  if (def.type === 'enum') return def.options.find((o) => o.value === v)?.about ?? ''
  return def.special?.[v] ?? (def.about ?? '').replace('{v}', v)
}
