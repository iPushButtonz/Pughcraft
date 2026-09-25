/**
 * Every game rule Pughcraft knows, across Minecraft versions. `id` is the modern (26.x) name.
 * `names` lists what each version calls it, newest first; an entry starting with "!" is an old
 * rule with the opposite meaning (e.g. "disableRaids" vs "raids"). Defaults are vanilla's, read
 * from a fresh 26.2 world. Titles follow Minecraft's own wording; on/off texts are plain English.
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
  /** bool: what "on" and "off" mean. int: `on` explains the number, `off` is unused. */
  on: string
  off: string
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
  min = 0,
  max = 2147483647
): GameRuleDef => ({ id, names, type: 'int', category, title, default: def, on: about, off: '', min, max })

export const GAME_RULES: GameRuleDef[] = [
  // Players
  b('pvp', ['pvp'], 'player', 'Player vs player (PvP)', true, 'Players can hurt each other (normal).', 'Players can’t hurt each other.'),
  b('keep_inventory', ['keep_inventory', 'keepInventory'], 'player', 'Keep inventory after death', false, 'Players keep their items and XP when they die.', 'Players drop their items and XP when they die (normal).'),
  b('natural_health_regeneration', ['natural_health_regeneration', 'naturalRegeneration'], 'player', 'Regenerate health', true, 'Health slowly comes back when players have enough food (normal).', 'Health only comes back from potions, golden apples and the like.'),
  b('immediate_respawn', ['immediate_respawn', 'doImmediateRespawn'], 'player', 'Respawn immediately', false, 'Players respawn right away, without the death screen.', 'Players see the death screen and click Respawn (normal).'),
  b('fall_damage', ['fall_damage', 'fallDamage'], 'player', 'Fall damage', true, 'Falling hurts (normal).', 'Players never take fall damage.'),
  b('fire_damage', ['fire_damage', 'fireDamage'], 'player', 'Fire damage', true, 'Fire and lava hurt (normal).', 'Players never take fire damage.'),
  b('drowning_damage', ['drowning_damage', 'drowningDamage'], 'player', 'Drowning damage', true, 'Running out of air hurts (normal).', 'Players can’t drown.'),
  b('freeze_damage', ['freeze_damage', 'freezeDamage'], 'player', 'Freeze damage', true, 'Powder snow freezes and hurts (normal).', 'Powder snow never hurts.'),
  n('players_sleeping_percentage', ['players_sleeping_percentage', 'playersSleepingPercentage'], 'player', 'Sleep percentage', 100, 'Percent of online players who must sleep to skip the night. 100 = everyone (normal); 0 = one person is enough.', 0, 100),
  n('respawn_radius', ['respawn_radius', 'spawnRadius'], 'player', 'Respawn area size', 10, 'How many blocks from the world spawn new and respawning players can appear.', 0, 1000),
  b('ender_pearls_vanish_on_death', ['ender_pearls_vanish_on_death', 'enderPearlsVanishOnDeath'], 'player', 'Ender pearls vanish on death', true, 'Pearls a player threw disappear if they die (normal).', 'Thrown pearls keep flying and still teleport after death.'),
  b('limited_crafting', ['limited_crafting', 'doLimitedCrafting'], 'player', 'Require recipe for crafting', false, 'Players can only craft recipes they’ve unlocked.', 'Players can craft anything they know (normal).'),
  b('locator_bar', ['locator_bar', 'locatorBar'], 'player', 'Player locator bar', true, 'A bar on screen shows which way other players are (normal).', 'No locator bar.'),
  b('reduced_debug_info', ['reduced_debug_info', 'reducedDebugInfo'], 'player', 'Reduce debug info', false, 'The F3 screen hides coordinates and other details.', 'The F3 screen shows everything (normal).'),
  b('spectators_generate_chunks', ['spectators_generate_chunks', 'spectatorsGenerateChunks'], 'player', 'Spectators load new land', true, 'Players in spectator mode generate new land as they fly (normal).', 'Spectators can only see land that already exists.'),
  n('players_nether_portal_default_delay', ['players_nether_portal_default_delay', 'playersNetherPortalDefaultDelay'], 'player', 'Nether portal delay (survival)', 80, 'Ticks a player stands in a nether portal before travelling. 20 ticks = 1 second; 80 = 4 s (normal).'),
  n('players_nether_portal_creative_delay', ['players_nether_portal_creative_delay', 'playersNetherPortalCreativeDelay'], 'player', 'Nether portal delay (creative)', 0, 'Ticks a creative-mode player stands in a nether portal before travelling. 0 = instant (normal).'),
  b('allow_entering_nether_using_portals', ['allow_entering_nether_using_portals', 'allowEnteringNetherUsingPortals'], 'player', 'Allow the Nether', true, 'Nether portals work (normal).', 'Nether portals don’t take anyone to the Nether.'),
  b('player_movement_check', ['player_movement_check', '!disablePlayerMovementCheck'], 'player', 'Player movement check', true, 'The server rejects moves that look too fast (normal; stops some cheats).', 'The server trusts every move (can help laggy players, but allows speed cheats).'),
  b('elytra_movement_check', ['elytra_movement_check', '!disableElytraMovementCheck'], 'player', 'Elytra movement check', true, 'The server rejects elytra flights that look too fast (normal).', 'The server trusts every elytra move.'),

  // Mobs
  b('mob_griefing', ['mob_griefing', 'mobGriefing'], 'mobs', 'Mob griefing', true, 'Creepers blow up blocks, endermen move blocks, and so on (normal).', 'Mobs can’t change or break blocks.'),
  b('universal_anger', ['universal_anger', 'universalAnger'], 'mobs', 'Universal anger', false, 'Angry neutral mobs attack any nearby player, not just the one who angered them.', 'Angry neutral mobs only go after the player who angered them (normal).'),
  b('forgive_dead_players', ['forgive_dead_players', 'forgiveDeadPlayers'], 'mobs', 'Forgive dead players', true, 'Angry neutral mobs calm down when the player they’re after dies (normal).', 'Angry neutral mobs stay angry after that player dies.'),
  n('max_entity_cramming', ['max_entity_cramming', 'maxEntityCramming'], 'mobs', 'Crowding limit', 24, 'How many mobs can squeeze into one block before they start taking damage. 24 is normal; 0 turns it off.'),
  b('raids', ['raids', '!disableRaids'], 'mobs', 'Raids', true, 'Villages can be raided by pillagers (normal).', 'Raids never happen.'),

  // Spawning
  b('spawn_mobs', ['spawn_mobs', 'doMobSpawning'], 'spawning', 'Spawn mobs', true, 'Animals and monsters appear naturally (normal).', 'No mobs appear on their own (spawn eggs and spawners still work).'),
  b('spawn_monsters', ['spawn_monsters', 'spawnMonsters'], 'spawning', 'Spawn monsters', true, 'Hostile monsters appear naturally (normal).', 'No hostile monsters appear on their own.'),
  b('spawn_phantoms', ['spawn_phantoms', 'doInsomnia'], 'spawning', 'Spawn phantoms', true, 'Phantoms come for players who haven’t slept in a while (normal).', 'Phantoms never appear.'),
  b('spawn_patrols', ['spawn_patrols', 'doPatrolSpawning'], 'spawning', 'Pillager patrols', true, 'Pillager patrols roam the world (normal).', 'No pillager patrols.'),
  b('spawn_wandering_traders', ['spawn_wandering_traders', 'doTraderSpawning'], 'spawning', 'Wandering traders', true, 'Wandering traders visit now and then (normal).', 'No wandering traders.'),
  b('spawn_wardens', ['spawn_wardens', 'doWardenSpawning'], 'spawning', 'Wardens', true, 'Wardens can be summoned by sculk shriekers (normal).', 'Wardens never appear.'),
  b('spawner_blocks_work', ['spawner_blocks_work', 'spawnerBlocksEnabled'], 'spawning', 'Spawner blocks work', true, 'Mob spawner blocks spawn mobs (normal).', 'Spawner blocks do nothing.'),

  // Drops
  b('block_drops', ['block_drops', 'doTileDrops'], 'drops', 'Blocks drop items', true, 'Broken blocks drop items and XP (normal).', 'Broken blocks drop nothing.'),
  b('mob_drops', ['mob_drops', 'doMobLoot'], 'drops', 'Mobs drop loot', true, 'Mobs drop items and XP when killed (normal).', 'Mobs drop nothing.'),
  b('entity_drops', ['entity_drops', 'doEntityDrops'], 'drops', 'Objects drop items', true, 'Minecarts, boats, item frames and the like drop themselves and their contents when broken (normal).', 'They drop nothing.'),
  b('block_explosion_drop_decay', ['block_explosion_drop_decay', 'blockExplosionDropDecay'], 'drops', 'Bed and anchor explosions lose drops', true, 'Blocks blown up by beds or respawn anchors sometimes drop nothing (normal).', 'Every block blown up that way drops.'),
  b('mob_explosion_drop_decay', ['mob_explosion_drop_decay', 'mobExplosionDropDecay'], 'drops', 'Mob explosions lose drops', true, 'Blocks blown up by creepers and other mobs sometimes drop nothing (normal).', 'Every block a mob blows up drops.'),
  b('tnt_explosion_drop_decay', ['tnt_explosion_drop_decay', 'tntExplosionDropDecay'], 'drops', 'TNT explosions lose drops', false, 'Blocks blown up by TNT sometimes drop nothing.', 'Every block TNT blows up drops (normal).'),

  // World updates
  b('advance_time', ['advance_time', 'doDaylightCycle'], 'world', 'Day and night cycle', true, 'Time passes, so day turns into night (normal).', 'Time stands still.'),
  b('advance_weather', ['advance_weather', 'doWeatherCycle'], 'world', 'Weather changes', true, 'Rain, snow and thunderstorms come and go (normal).', 'The weather stays as it is.'),
  n('random_tick_speed', ['random_tick_speed', 'randomTickSpeed'], 'world', 'Random tick speed', 3, 'How fast crops grow, leaves decay, fire spreads and so on. 3 is normal; higher is faster; 0 stops it.', 0, 4096),
  n('fire_spread_radius_around_player', ['fire_spread_radius_around_player'], 'world', 'Fire spread radius', 128, 'How many blocks around a player fire can spread. 128 is normal; 0 stops fire spreading.'),
  b('fire_tick', ['doFireTick'], 'world', 'Fire spreads', true, 'Fire spreads and burns out (normal).', 'Fire stays where it is and never spreads.'),
  b('allow_fire_ticks_away_from_player', ['allowFireTicksAwayFromPlayer'], 'world', 'Fire far from players', false, 'Fire and lava keep spreading even far away from every player.', 'Fire only spreads near players (normal).'),
  b('tnt_explodes', ['tnt_explodes', 'tntExplodes'], 'world', 'TNT explodes', true, 'TNT can be lit and explodes (normal).', 'TNT can’t be lit.'),
  b('projectiles_can_break_blocks', ['projectiles_can_break_blocks', 'projectilesCanBreakBlocks'], 'world', 'Projectiles break blocks', true, 'Things like wind charges can break blocks they hit (normal).', 'Projectiles never break blocks.'),
  b('spread_vines', ['spread_vines', 'doVinesSpread'], 'world', 'Vines spread', true, 'Vines grow onto nearby blocks (normal).', 'Vines stay the size they are.'),
  b('water_source_conversion', ['water_source_conversion', 'waterSourceConversion'], 'world', 'Water makes new sources', true, 'Flowing water between two sources becomes a source, so infinite water works (normal).', 'Infinite water pools don’t work.'),
  b('lava_source_conversion', ['lava_source_conversion', 'lavaSourceConversion'], 'world', 'Lava makes new sources', false, 'Flowing lava between two sources becomes a source, so infinite lava works.', 'Infinite lava doesn’t work (normal).'),
  n('max_snow_accumulation_height', ['max_snow_accumulation_height', 'snowAccumulationHeight'], 'world', 'Snow depth', 1, 'How many layers of snow can pile up when it snows. 1 is normal.', 0, 8),
  n('spawn_chunk_radius', ['spawnChunkRadius'], 'world', 'Spawn chunks', 2, 'How many chunks around the world spawn always stay loaded. 2 is normal; 0 unloads them.', 0, 32),
  b('entities_with_passengers_can_use_portals', ['entitiesWithPassengersCanUsePortals'], 'world', 'Riders can use portals', false, 'Boats, minecarts and mobs carrying passengers can go through portals.', 'They can’t (normal).'),

  // Chat
  b('show_death_messages', ['show_death_messages', 'showDeathMessages'], 'chat', 'Death messages', true, 'Chat says when a player dies (normal).', 'Deaths aren’t announced.'),
  b('show_advancement_messages', ['show_advancement_messages', 'announceAdvancements'], 'chat', 'Advancement messages', true, 'Chat says when a player earns an advancement (normal).', 'Advancements aren’t announced.'),
  b('send_command_feedback', ['send_command_feedback', 'sendCommandFeedback'], 'chat', 'Command feedback', true, 'Players see the result of the commands they run (normal).', 'Commands run silently.'),
  b('log_admin_commands', ['log_admin_commands', 'logAdminCommands'], 'chat', 'Tell ops about admin commands', true, 'Operators see when other ops run commands (normal).', 'Admin commands aren’t broadcast.'),
  b('command_block_output', ['command_block_output', 'commandBlockOutput'], 'chat', 'Command block messages', true, 'Command blocks report what they did in chat (normal).', 'Command blocks run silently.'),
  b('global_sound_events', ['global_sound_events', 'globalSoundEvents'], 'chat', 'World-wide sounds', true, 'Some big events, like a boss spawning, are heard everywhere (normal).', 'Those sounds are only heard nearby.'),

  // Other
  b('command_blocks_work', ['command_blocks_work', 'commandBlocksEnabled', 'enableCommandBlocks'], 'misc', 'Command blocks', true, 'Command blocks run their commands (normal).', 'Command blocks do nothing.'),
  n('max_block_modifications', ['max_block_modifications', 'commandModificationBlockLimit'], 'misc', 'Command block-change limit', 32768, 'Most blocks one command (like /fill or /clone) can change at once.', 1),
  n('max_command_sequence_length', ['max_command_sequence_length', 'maxCommandChainLength'], 'misc', 'Command chain limit', 65536, 'Longest chain of commands that functions and command blocks can run at once.'),
  n('max_command_forks', ['max_command_forks', 'maxCommandForkCount'], 'misc', 'Command context limit', 65536, 'Most contexts a command like "execute as" can use at once.'),
  n('max_minecart_speed', ['max_minecart_speed', 'minecartMaxSpeed'], 'misc', 'Minecart top speed', 8, 'Fastest a minecart can go on land (experimental feature).', 1, 1000)
]

export const GAME_RULES_BY_ID: Record<string, GameRuleDef> = Object.fromEntries(GAME_RULES.map((r) => [r.id, r]))

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
