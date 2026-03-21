import type { AIContext } from './provider'

export function formatConversationForPrompt(context: AIContext): string {
  if (context.conversationHistory.length === 0) return ''

  return context.conversationHistory
    .map((msg) => {
      const prefix = msg.role === 'user' ? 'User' : 'Assistant'
      return `${prefix}: ${msg.content}`
    })
    .join('\n\n')
}
