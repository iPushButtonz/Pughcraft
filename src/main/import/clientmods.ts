/**
 * Mod ids that only work inside the game, never on a server. Used when neither the mod
 * itself nor Modrinth says which side it's for. Kept short and conservative on purpose:
 * a wrongly removed mod is worse than one the trial start has to catch.
 */
export const KNOWN_CLIENT_ONLY = new Set([
  'optifine',
  'optifabric',
  'sodium',
  'sodiumextra',
  'sodium-extra',
  'reeses-sodium-options',
  'reeses_sodium_options',
  'iris',
  'oculus',
  'embeddium',
  'rubidium',
  'indium',
  'modmenu',
  'betterf3',
  'controlling',
  'mousetweaks',
  'xaerominimap',
  'xaeroworldmap',
  'entityculling',
  'entity_model_features',
  'entity_texture_features',
  'notenoughanimations',
  'skinlayers3d',
  'lambdynlights',
  'dynamiclights',
  'continuity',
  'zoomify',
  'ok_zoomer',
  'cullleaves',
  'fancymenu',
  'drippyloadingscreen',
  'citresewn',
  'enhancedblockentities',
  'chat_heads',
  'legendarytooltips',
  'equipmentcompare',
  'torohealth',
  'neat',
  'catalogue',
  'yosbr',
  'immediatelyfast',
  'fpsreducer',
  'betterclouds',
  'particlerain'
])

/** Dependency ids that are the game or loader itself, never a separate mod file. */
export const PLATFORM_IDS = new Set([
  'minecraft',
  'java',
  'fabricloader',
  'fabric-loader',
  'quilt_loader',
  'forge',
  'neoforge',
  'fml',
  'mcp',
  'javafml'
])
