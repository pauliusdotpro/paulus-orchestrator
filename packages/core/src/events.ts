import type { AIEvent, ServerConnection } from '@paulus/shared'

export interface RuntimeEventSink {
  emitAIEvent(event: AIEvent & { sessionId: string }): void
  emitSSHOutput(event: {
    serverId: string
    sessionId: string
    data: string
    stream: 'stdout' | 'stderr'
  }): void
  emitConnectionStatus(status: ServerConnection): void
}

export const noopRuntimeEventSink: RuntimeEventSink = {
  emitAIEvent() {},
  emitSSHOutput() {},
  emitConnectionStatus() {},
}
