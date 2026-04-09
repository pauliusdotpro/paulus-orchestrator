export interface UpdateInfo {
  version: string
  releaseName?: string | null
  releaseNotes?: string | null
  releaseDate?: string | null
}

export interface UpdateDownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export type UpdaterEvent =
  | { type: 'checking-for-update' }
  | { type: 'update-available'; info: UpdateInfo }
  | { type: 'update-not-available'; info: UpdateInfo }
  | { type: 'download-progress'; progress: UpdateDownloadProgress }
  | { type: 'update-downloaded'; info: UpdateInfo }
  | { type: 'error'; message: string }

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdaterState {
  status: UpdaterStatus
  currentVersion: string
  info: UpdateInfo | null
  progress: UpdateDownloadProgress | null
  error: string | null
  supported: boolean
}
