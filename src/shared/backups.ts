export type BackupKind = 'auto' | 'manual' | 'safety'

/** When a server backs itself up (owner's choice: any combination; manual always works). */
export interface BackupSchedule {
  /** Minutes between automatic backups while people play; null turns them off. */
  intervalMinutes: number | null
  /** Back up as soon as the last player leaves. */
  onEmpty: boolean
  /** Back up when the server stops (if anyone played since the last backup). */
  onStop: boolean
  /** How many automatic backups to keep. Manual and protected ones don't count. */
  keep: number
  /** Another folder or drive for this server's backups; null = inside the server folder. */
  location: string | null
}

export const DEFAULT_BACKUP_SCHEDULE: BackupSchedule = {
  intervalMinutes: 15,
  onEmpty: true,
  onStop: true,
  keep: 10,
  location: null
}

export interface BackupInfo {
  id: string
  kind: BackupKind
  /** Plain words, e.g. "Every 15 minutes", "Before restoring", "Backed up by you". */
  reason: string
  createdAt: string
  protected: boolean
  mcVersion: string
  /** Size of everything in the backup. */
  totalBytes: number
  /** New data this backup added (unchanged files are shared with other backups). */
  newBytes: number
  fileCount: number
  /** Level name of the world that was active. */
  worldName: string | null
}

export interface BackupsView {
  schedule: BackupSchedule
  backups: BackupInfo[]
  /** Disk space used by all of this server's backups together. */
  diskBytes: number
  /** Where the backups are stored. */
  location: string
  running: boolean
}

export type RestoreMode = 'server' | 'world'
