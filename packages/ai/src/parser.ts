import type { Readable } from 'stream'

export async function* parseNDJSON<T>(stream: Readable): AsyncGenerator<T> {
  let buffer = ''
  for await (const chunk of stream) {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        yield JSON.parse(trimmed) as T
      } catch {
        // skip malformed lines
      }
    }
  }
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer.trim()) as T
    } catch {
      // skip
    }
  }
}
