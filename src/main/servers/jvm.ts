import type { Loader } from '@shared/servers'

/**
 * Garbage-collector tuning based on Aikar's widely used flags, trimmed to options
 * every Java from 8 to 25 accepts (removed options would stop the JVM from starting).
 */
export const PERFORMANCE_FLAGS = [
  '-XX:+UseG1GC',
  '-XX:+ParallelRefProcEnabled',
  '-XX:MaxGCPauseMillis=200',
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+DisableExplicitGC',
  '-XX:G1NewSizePercent=30',
  '-XX:G1MaxNewSizePercent=40',
  '-XX:G1HeapRegionSize=8M',
  '-XX:G1ReservePercent=20',
  '-XX:G1HeapWastePercent=5',
  '-XX:G1MixedGCCountTarget=4',
  '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90',
  '-XX:SurvivorRatio=32',
  '-XX:+PerfDisableSharedMem',
  '-XX:MaxTenuringThreshold=1'
]

/** So console text with accents or emoji isn't garbled on Windows. */
export const ENCODING_FLAGS = [
  '-Dfile.encoding=UTF-8',
  '-Dstdout.encoding=UTF-8',
  '-Dstderr.encoding=UTF-8'
]

export interface Log4jFix {
  /** File to place in the server folder, if any. */
  file?: { name: string; url: string; sha1: string }
  flag: string
}

const LOG4J_17_111 = {
  name: 'log4j2_17-111.xml',
  url: 'https://launcher.mojang.com/v1/objects/4bb89a97a66f350bc9f73b3ca8509632682aea2e/log4j2_17-111.xml',
  sha1: '4bb89a97a66f350bc9f73b3ca8509632682aea2e'
}
const LOG4J_112_116 = {
  name: 'log4j2_112-116.xml',
  url: 'https://launcher.mojang.com/v1/objects/02937d122c86ce73319ef9975b58896fc1b491d1/log4j2_112-116.xml',
  sha1: '02937d122c86ce73319ef9975b58896fc1b491d1'
}

/**
 * Mojang's official Log4Shell (CVE-2021-44228) mitigation for servers older than 1.18.1.
 * `band` says which range the version falls in; Paper and NeoForge ship patched builds.
 */
export function log4jFixFor(
  loader: Loader,
  band: 'pre-1.12' | '1.12-1.16' | '1.17-1.18.0' | 'safe'
): Log4jFix | null {
  if (band === 'safe' || loader === 'paper' || loader === 'neoforge') return null
  // Current Forge builds for 1.12+ patched it themselves; its 1.7.10-1.11 builds never did.
  if (loader === 'forge' && band !== 'pre-1.12') return null
  if (band === 'pre-1.12') return { file: LOG4J_17_111, flag: `-Dlog4j.configurationFile=${LOG4J_17_111.name}` }
  if (band === '1.12-1.16') return { file: LOG4J_112_116, flag: `-Dlog4j.configurationFile=${LOG4J_112_116.name}` }
  return { flag: '-Dlog4j2.formatMsgNoLookups=true' }
}

export function defaultJvmArgs(log4j: Log4jFix | null): string[] {
  return [...PERFORMANCE_FLAGS, ...ENCODING_FLAGS, ...(log4j ? [log4j.flag] : [])]
}
