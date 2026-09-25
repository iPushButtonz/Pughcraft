/**
 * Every game rule Pughcraft knows, across Minecraft versions. `id` is the modern (26.x) name.
 * `names` lists what each version calls it, newest first; an entry starting with "!" is an old
 * rule with the opposite meaning (e.g. "disableRaids" vs "raids"). Defaults are vanilla's, read
 * from a fresh 26.2 world. Titles follow Minecraft's own wording.
 */

export type GameRuleCategory = 'player' | 'mobs' | 'spawning' | 'drops' | 'world' | 'chat' | 'misc'

export interface GameRuleDef {
  id: string
  names: string[]
  type: 'bool' | 'int'
  category: GameRuleCategory
  title: string
  /** Vanilla's default. */
  default: boolean | number
  /** bool: what the rule does when on / off. int: `on` describes the value ({v} = the number), `off` is unused. */
  on: string
  off: string
  /** int: descriptions for specific values (like 0 = off), used instead of `on`. */
  special?: Record<number, string>
  /** int: allowed range. */
  min?: number
  max?: number
}

export const GAME_RULE_CATEGORIES: Record<GameRuleCategory, string> = {
  player: 'Players',
  mobs: 'Mobs',
  spawning: 'Spawning',
  drops: 'Drops',
  world: 'World updates',
  chat: 'Chat',
  misc: 'Other'
}

const b = (
  id: string,
  names: string[],
  category: GameRuleCategory,
  title: string,
  def: boolean,
  on: string,
  off: string
): GameRuleDef => ({ id, names, type: 'bool', category, title, default: def, on, off })

const n = (
  id: string,
  names: string[],
  category: GameRuleCategory,
  title: string,
  def: number,
  about: string,
  special: Record<number, string> = {},
  min = 0,
  max = 2147483647
): GameRuleDef => ({ id, names, type: 'int', category, title, default: def, on: about, off: '', special, min, max })

export const GAME_RULES: GameRuleDef[] = [
  // Players
  b('pvp', ['pvp'], 'player', 'Player vs player (PvP)', true, 'Players can hurt each other', 'Players can’t hurt each other'),
  b('keep_inventory', ['keep_inventory', 'keepInventory'], 'player', 'Keep inventory after death', false, 'Players keep items and XP when they die', 'Players drop items and XP when they die'),
  b('natural_health_regeneration', ['natural_health_regeneration', 'naturalRegeneration'], 'player', 'Regenerate health', true, 'Health regenerates when players are fed', 'Health doesn’t regenerate on its own'),
  b('immediate_respawn', ['immediate_respawn', 'doImmediateRespawn'], 'player', 'Respawn immediately', false, 'Players respawn instantly', 'Players see the death screen'),
  b('fall_damage', ['fall_damage', 'fallDamage'], 'player', 'Fall damage', true, 'Falling hurts', 'Falling doesn’t hurt'),
  b('fire_damage', ['fire_damage', 'fireDamage'], 'player', 'Fire damage', true, 'Fire and lava hurt', 'Fire and lava don’t hurt'),
  b('drowning_damage', ['drowning_damage', 'drowningDamage'], 'player', 'Drowning damage', true, 'Players can drown', 'Players can’t drown'),
  b('freeze_damage', ['freeze_damage', 'freezeDamage'], 'player', 'Freeze damage', true, 'Powder snow hurts', 'Powder snow doesn’t hurt'),
  n('players_sleeping_percentage', ['players_sleeping_percentage', 'playersSleepingPercentage'], 'player', 'Sleep percentage', 100, '{v}% of players must sleep to skip the night', { 0: 'One sleeping player skips the night', 100: 'Everyone must sleep to skip the night' }, 0, 100),
  n('respawn_radius', ['respawn_radius', 'spawnRadius'], 'player', 'Respawn area size', 10, 'Players spawn within {v} blocks of world spawn', { 0: 'Players spawn exactly at world spawn' }, 0, 1000),
  b('ender_pearls_vanish_on_death', ['ender_pearls_vanish_on_death', 'enderPearlsVanishOnDeath'], 'player', 'Ender pearls vanish on death', true, 'Thrown pearls vanish when the thrower dies', 'Thrown pearls still land after the thrower dies'),
  b('limited_crafting', ['limited_crafting', 'doLimitedCrafting'], 'player', 'Require recipe for crafting', false, 'Only unlocked recipes can be crafted', 'Any recipe can be crafted'),
  b('locator_bar', ['locator_bar', 'locatorBar'], 'player', 'Player locator bar', true, 'The locator bar shows other players', 'No locator bar'),
  b('reduced_debug_info', ['reduced_debug_info', 'reducedDebugInfo'], 'player', 'Reduce debug info', false, 'F3 hides coordinates', 'F3 shows everything'),
  b('spectators_generate_chunks', ['spectators_generate_chunks', 'spectatorsGenerateChunks'], 'player', 'Spectators load new land', true, 'Spectators generate new land', 'Spectators only see existing land'),
  n('players_nether_portal_default_delay', ['players_nether_portal_default_delay', 'playersNetherPortalDefaultDelay'], 'player', 'Nether portal delay (survival)', 80, 'Portals take {v} ticks (20 = 1 second)', { 0: 'Portals are instant' }),
  n('players_nether_portal_creative_delay', ['players_nether_portal_creative_delay', 'playersNetherPortalCreativeDelay'], 'player', 'Nether portal delay (creative)', 0, 'Portals take {v} ticks (20 = 1 second)', { 0: 'Portals are instant' }),
  b('allow_entering_nether_using_portals', ['allow_entering_nether_using_portals', 'allowEnteringNetherUsingPortals'], 'player', 'Allow the Nether', true, 'Nether portals work', 'Nether portals don’t work'),
  b('player_movement_check', ['player_movement_check', '!disablePlayerMovementCheck'], 'player', 'Player movement check', true, 'Moves that are too fast are rejected', 'Every move is trusted'),
  b('elytra_movement_check', ['elytra_movement_check', '!disableElytraMovementCheck'], 'player', 'Elytra movement check', true, 'Elytra flight that is too fast is rejected', 'Every elytra move is trusted'),

  // Mobs
  b('mob_griefing', ['mob_griefing', 'mobGriefing'], 'mobs', 'Mob griefing', true, 'Mobs break and move blocks', 'Mobs can’t change blocks'),
  b('universal_anger', ['universal_anger', 'universalAnger'], 'mobs', 'Universal anger', false, 'Angry mobs attack every nearby player', 'Angry mobs only attack whoever angered them'),
  b('forgive_dead_players', ['forgive_dead_players', 'forgiveDeadPlayers'], 'mobs', 'Forgive dead players', true, 'Mob anger ends when the target dies', 'Mobs stay angry after the target dies'),
  n('max_entity_cramming', ['max_entity_cramming', 'maxEntityCramming'], 'mobs', 'Crowding limit', 24, 'Mobs take damage when more than {v} share a block', { 0: 'No crowding damage' }),
  b('raids', ['raids', '!disableRaids'], 'mobs', 'Raids', true, 'Villages can be raided', 'Raids never happen'),

  // Spawning
  b('spawn_mobs', ['spawn_mobs', 'doMobSpawning'], 'spawning', 'Spawn mobs', true, 'Mobs spawn naturally', 'Mobs don’t spawn naturally'),
  b('spawn_monsters', ['spawn_monsters', 'spawnMonsters'], 'spawning', 'Spawn monsters', true, 'Monsters spawn', 'Monsters don’t spawn'),
  b('spawn_phantoms', ['spawn_phantoms', 'doInsomnia'], 'spawning', 'Spawn phantoms', true, 'Phantoms spawn', 'Phantoms don’t spawn'),
  b('spawn_patrols', ['spawn_patrols', 'doPatrolSpawning'], 'spawning', 'Pillager patrols', true, 'Pillager patrols spawn', 'Pillager patrols don’t spawn'),
  b('spawn_wandering_traders', ['spawn_wandering_traders', 'doTraderSpawning'], 'spawning', 'Wandering traders', true, 'Wandering traders visit', 'Wandering traders don’t visit'),
  b('spawn_wardens', ['spawn_wardens', 'doWardenSpawning'], 'spawning', 'Wardens', true, 'Wardens can be summoned', 'Wardens never spawn'),
  b('spawner_blocks_work', ['spawner_blocks_work', 'spawnerBlocksEnabled'], 'spawning', 'Spawner blocks work', true, 'Spawners spawn mobs', 'Spawners do nothing'),

  // Drops
  b('block_drops', ['block_drops', 'doTileDrops'], 'drops', 'Blocks drop items', true, 'Broken blocks drop items', 'Broken blocks drop nothing'),
  b('mob_drops', ['mob_drops', 'doMobLoot'], 'drops', 'Mobs drop loot', true, 'Mobs drop loot and XP', 'Mobs drop nothing'),
  b('entity_drops', ['entity_drops', 'doEntityDrops'], 'drops', 'Objects drop items', true, 'Minecarts, boats and frames drop items', 'Minecarts, boats and frames drop nothing'),
  b('block_explosion_drop_decay', ['block_explosion_drop_decay', 'blockExplosionDropDecay'], 'drops', 'Bed and anchor explosions lose drops', true, 'Bed and anchor explosions lose some drops', 'Bed and anchor explosions drop everything'),
  b('mob_explosion_drop_decay', ['mob_explosion_drop_decay', 'mobExplosionDropDecay'], 'drops', 'Mob explosions lose drops', true, 'Mob explosions lose some drops', 'Mob explosions drop everything'),
  b('tnt_explosion_drop_decay', ['tnt_explosion_drop_decay', 'tntExplosionDropDecay'], 'drops', 'TNT explosions lose drops', false, 'TNT explosions lose some drops', 'TNT explosions drop everything'),

  // World updates
  b('advance_time', ['advance_time', 'doDaylightCycle'], 'world', 'Day and night cycle', true, 'Day turns into night', 'Time is frozen'),
  b('advance_weather', ['advance_weather', 'doWeatherCycle'], 'world', 'Weather changes', true, 'Weather changes', 'Weather stays the same'),
  n('random_tick_speed', ['random_tick_speed', 'randomTickSpeed'], 'world', 'Random tick speed', 3, 'Crops, fire and leaves tick at speed {v} (3 = normal)', { 0: 'Crops don’t grow and leaves don’t decay' }, 0, 4096),
  n('fire_spread_radius_around_player', ['fire_spread_radius_around_player'], 'world', 'Fire spread radius', 128, 'Fire spreads within {v} blocks of players', { 0: 'Fire doesn’t spread' }),
  b('fire_tick', ['doFireTick'], 'world', 'Fire spreads', true, 'Fire spreads and burns out', 'Fire doesn’t spread'),
  b('allow_fire_ticks_away_from_player', ['allowFireTicksAwayFromPlayer'], 'world', 'Fire far from players', false, 'Fire spreads even with no one nearby', 'Fire only spreads near players'),
  b('tnt_explodes', ['tnt_explodes', 'tntExplodes'], 'world', 'TNT explodes', true, 'TNT can be lit', 'TNT can’t be lit'),
  b('projectiles_can_break_blocks', ['projectiles_can_break_blocks', 'projectilesCanBreakBlocks'], 'world', 'Projectiles break blocks', true, 'Projectiles can break blocks', 'Projectiles don’t break blocks'),
  b('spread_vines', ['spread_vines', 'doVinesSpread'], 'world', 'Vines spread', true, 'Vines spread', 'Vines don’t spread'),
  b('water_source_conversion', ['water_source_conversion', 'waterSourceConversion'], 'world', 'Water makes new sources', true, 'Infinite water works', 'Infinite water doesn’t work'),
  b('lava_source_conversion', ['lava_source_conversion', 'lavaSourceConversion'], 'world', 'Lava makes new sources', false, 'Infinite lava works', 'Infinite lava doesn’t work'),
  n('max_snow_accumulation_height', ['max_snow_accumulation_height', 'snowAccumulationHeight'], 'world', 'Snow depth', 1, 'Snow piles up to {v} layers', { 0: 'Snow doesn’t pile up', 1: 'Snow piles up 1 layer' }, 0, 8),
  n('spawn_chunk_radius', ['spawnChunkRadius'], 'world', 'Spawn chunks', 2, '{v} chunks around spawn stay loaded', { 0: 'Spawn chunks unload' }, 0, 32),
  b('entities_with_passengers_can_use_portals', ['entitiesWithPassengersCanUsePortals'], 'world', 'Riders can use portals', false, 'Mounts and carts with riders can use portals', 'Mounts and carts with riders can’t use portals'),

  // Chat
  b('show_death_messages', ['show_death_messages', 'showDeathMessages'], 'chat', 'Death messages', true, 'Deaths are announced', 'Deaths aren’t announced'),
  b('show_advancement_messages', ['show_advancement_messages', 'announceAdvancements'], 'chat', 'Advancement messages', true, 'Advancements are announced', 'Advancements aren’t announced'),
  b('send_command_feedback', ['send_command_feedback', 'sendCommandFeedback'], 'chat', 'Command feedback', true, 'Command results are shown', 'Commands run silently'),
  b('log_admin_commands', ['log_admin_commands', 'logAdminCommands'], 'chat', 'Tell ops about admin commands', true, 'Ops see other ops’ commands', 'Admin commands aren’t broadcast'),
  b('command_block_output', ['command_block_output', 'commandBlockOutput'], 'chat', 'Command block messages', true, 'Command blocks report in chat', 'Command blocks run silently'),
  b('global_sound_events', ['global_sound_events', 'globalSoundEvents'], 'chat', 'World-wide sounds', true, 'Boss sounds are heard everywhere', 'Boss sounds are only heard nearby'),

  // Other
  b('command_blocks_work', ['command_blocks_work', 'commandBlocksEnabled', 'enableCommandBlocks'], 'misc', 'Command blocks', true, 'Command blocks run', 'Command blocks do nothing'),
  n('max_block_modifications', ['max_block_modifications', 'commandModificationBlockLimit'], 'misc', 'Command block-change limit', 32768, 'One command can change up to {v} blocks', {}, 1),
  n('max_command_sequence_length', ['max_command_sequence_length', 'maxCommandChainLength'], 'misc', 'Command chain limit', 65536, 'Up to {v} commands per chain'),
  n('max_command_forks', ['max_command_forks', 'maxCommandForkCount'], 'misc', 'Command context limit', 65536, 'Up to {v} contexts per command'),
  n('max_minecart_speed', ['max_minecart_speed', 'minecartMaxSpeed'], 'misc', 'Minecart top speed', 8, 'Minecarts go up to {v} blocks per second (experimental)', {}, 1, 1000)
]

export const GAME_RULES_BY_ID: Record<string, GameRuleDef> = Object.fromEntries(GAME_RULES.map((r) => [r.id, r]))

/** One line saying what the rule does at this value. */
export function describeGameRule(def: GameRuleDef, value: GameRuleValue): string {
  if (def.type === 'bool') return value ? def.on : def.off
  return def.special?.[Number(value)] ?? def.on.replace('{v}', String(value))
}

export type GameRuleValue = boolean | number

export interface GameRuleState {
  id: string
  /** The value the world has now, or the one waiting to be applied. Null = unknown. */
  value: GameRuleValue | null
  /** A change saved while the server was stopped, applied on the next start. */
  pending: boolean
}

export interface GameRulesView {
  running: boolean
  /** False when the world doesn't exist yet (before first start). */
  known: boolean
  /** Only the rules this world's Minecraft version has. */
  rules: GameRuleState[]
}
