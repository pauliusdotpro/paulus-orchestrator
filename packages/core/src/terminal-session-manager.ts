import type { TerminalLine, TerminalLineType, TerminalSessionState } from '@paulus/shared'
import type { StorageService } from './storage'

interface PersistedTerminalSessionState extends TerminalSessionState {
  nextLineId: number
}

const EMPTY_TERMINAL_STATE: PersistedTerminalSessionState = {
  lines: [],
  history: [],
  nextLineId: 1,
}

export class TerminalSessionManager {
  constructor(private readonly storage: StorageService) {}

  async get(sessionId: string): Promise<TerminalSessionState> {
    const state = await this.load(sessionId)
    return {
      lines: state.lines,
      history: state.history,
    }
  }

  async recordCommand(sessionId: string, command: string): Promise<TerminalSessionState> {
    const state = await this.load(sessionId)
    state.history = [...state.history, command]
    state.lines = [
      ...state.lines,
      {
        id: state.nextLineId++,
        text: `$ ${command}`,
        type: 'stdin',
      },
    ]
    await this.save(sessionId, state)
    return {
      lines: state.lines,
      history: state.history,
    }
  }

  async appendOutput(
    sessionId: string,
    data: string,
    stream: Extract<TerminalLineType, 'stdout' | 'stderr'>,
  ): Promise<TerminalSessionState> {
    const textLines = splitTerminalText(data)
    if (textLines.length === 0) {
      return this.get(sessionId)
    }

    const state = await this.load(sessionId)
    state.lines = [
      ...state.lines,
      ...textLines.map(
        (text): TerminalLine => ({
          id: state.nextLineId++,
          text,
          type: stream,
        }),
      ),
    ]
    await this.save(sessionId, state)
    return {
      lines: state.lines,
      history: state.history,
    }
  }

  async appendSystem(sessionId: string, text: string): Promise<TerminalSessionState> {
    const state = await this.load(sessionId)
    state.lines = [
      ...state.lines,
      {
        id: state.nextLineId++,
        text,
        type: 'system',
      },
    ]
    await this.save(sessionId, state)
    return {
      lines: state.lines,
      history: state.history,
    }
  }

  async clear(sessionId: string): Promise<TerminalSessionState> {
    const state = await this.load(sessionId)
    state.lines = []
    await this.save(sessionId, state)
    return {
      lines: [],
      history: state.history,
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.storage.remove(this.key(sessionId))
  }

  private async load(sessionId: string): Promise<PersistedTerminalSessionState> {
    return (
      (await this.storage.get<PersistedTerminalSessionState>(this.key(sessionId))) ?? {
        ...EMPTY_TERMINAL_STATE,
      }
    )
  }

  private async save(sessionId: string, state: PersistedTerminalSessionState): Promise<void> {
    await this.storage.set(this.key(sessionId), state)
  }

  private key(sessionId: string): string {
    return `session-terminals/${sessionId}`
  }
}

function splitTerminalText(data: string): string[] {
  return data
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.length > 0)
}
