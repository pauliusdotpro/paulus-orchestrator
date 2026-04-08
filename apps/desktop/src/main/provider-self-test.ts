import type { AIProviderTestResult, AIProviderType } from '@paulus/shared'
import { createProvider, type AIContext } from '@paulus/ai'

const TEST_TOOL_NAME = 'paulus_get_server_context'
const TEST_TIMEOUT_MS = 30000
const TEST_SERVER_NAME = 'Settings Self-Test'

function createTestContext(): AIContext {
  return {
    server: {
      name: TEST_SERVER_NAME,
      host: '127.0.0.1',
      port: 22,
      username: 'paulus',
      authMethod: 'key',
      hasStoredPassword: false,
      tags: ['settings', 'self-test'],
      connected: false,
    },
    conversationHistory: [],
  }
}

export async function testAIProvider(providerType: AIProviderType): Promise<AIProviderTestResult> {
  const provider = createProvider(providerType)
  const isAvailable = await provider.available()

  if (!isAvailable) {
    return {
      provider: providerType,
      ok: false,
      toolCalled: false,
      toolName: TEST_TOOL_NAME,
      responseText: '',
      detail: `${providerType} is not available on this machine.`,
    }
  }

  const expectedResponse = `${providerType} self-test passed for ${TEST_SERVER_NAME}.`
  const toolCalls: Array<{ name: string; argsText: string }> = []
  const responseParts: string[] = []
  const errors: string[] = []
  const context: AIContext = {
    ...createTestContext(),
    onPaulusToolCall: (toolName, args) => {
      toolCalls.push({
        name: toolName,
        argsText: JSON.stringify(args ?? {}, null, 2) || '{}',
      })
    },
  }

  const prompt =
    `This is an automated provider self-test. ` +
    `Do not greet. Do not say "How can I help?". Do not describe your capabilities. ` +
    `Before writing any answer, call the MCP tool ${TEST_TOOL_NAME} exactly once. ` +
    `After the tool returns, write exactly this sentence and nothing else: "${expectedResponse}"`

  const process = provider.spawn(prompt, context, { model: null })

  try {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Provider self-test timed out after 30 seconds.'))
      }, TEST_TIMEOUT_MS)

      ;(async () => {
        for await (const event of process.events) {
          if (event.type === 'text') {
            responseParts.push(event.text)
            continue
          }

          if (event.type === 'tool_call') {
            toolCalls.push({ name: event.toolName, argsText: event.argsText })
            continue
          }

          if (event.type === 'tool_state' && event.tool.status === 'pending') {
            toolCalls.push({ name: event.tool.toolName, argsText: event.tool.argsText })
            continue
          }

          if (event.type === 'error') {
            errors.push(event.message)
          }
        }
      })()
        .then(() => {
          clearTimeout(timeoutId)
          resolve()
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  } catch (error) {
    process.kill()

    return {
      provider: providerType,
      ok: false,
      toolCalled: toolCalls.some((call) => call.name === TEST_TOOL_NAME),
      toolName: TEST_TOOL_NAME,
      responseText: responseParts.join('').trim(),
      detail: error instanceof Error ? error.message : String(error),
    }
  }

  const responseText = responseParts.join('').trim()
  const toolCall = toolCalls.find((call) => call.name === TEST_TOOL_NAME)
  const ok = Boolean(toolCall) && responseText.includes(expectedResponse) && errors.length === 0

  return {
    provider: providerType,
    ok,
    toolCalled: Boolean(toolCall),
    toolName: TEST_TOOL_NAME,
    responseText,
    detail: ok
      ? `Called ${TEST_TOOL_NAME} and received a matching response.`
      : (errors[0] ??
        (!toolCall
          ? `${providerType} did not call ${TEST_TOOL_NAME}.`
          : `The provider responded, but the final text did not match the expected self-test sentence.`)),
  }
}
