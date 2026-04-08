import { describe, expect, test } from 'bun:test'
import {
  buildInvalidToolState,
  buildServerCommandToolState,
  createCommandToolOutput,
  createOutputPreview,
  formatCommandResultForModel,
  normalizePaulusToolName,
} from './tool-state'

describe('tool-state helpers', () => {
  test('truncates output previews with omitted character counts', () => {
    expect(createOutputPreview('abcdef', 3)).toEqual({
      text: 'abc',
      truncated: true,
      omittedCharacters: 3,
    })
  })

  test('keeps short output previews intact', () => {
    expect(createOutputPreview('abc', 3)).toEqual({
      text: 'abc',
      truncated: false,
      omittedCharacters: 0,
    })
  })

  test('formats truncated command results for model-visible tool output', () => {
    const output = formatCommandResultForModel(
      {
        exitCode: 1,
        stdout: 'abcdef',
        stderr: 'uvwxyz',
      },
      3,
    )

    expect(output).toContain('Command completed (exit 1)')
    expect(output).toContain('abc')
    expect(output).toContain('[stdout truncated; omitted 3 characters]')
    expect(output).toContain('uvw')
    expect(output).toContain('[stderr truncated; omitted 3 characters]')
    expect(output).not.toContain('def')
    expect(output).not.toContain('xyz')
  })

  test('builds server command tool states with command metadata', () => {
    expect(
      buildServerCommandToolState({
        id: 'call-1',
        command: 'uptime',
        status: 'pending',
        explanation: 'requires approval',
      }),
    ).toMatchObject({
      id: 'call-1',
      toolName: 'paulus_exec_server_command',
      kind: 'server-command',
      status: 'pending',
      command: 'uptime',
      args: { command: 'uptime' },
      explanation: 'requires approval',
    })
  })

  test('marks failed command output as an error state signal', () => {
    const output = createCommandToolOutput({
      exitCode: 2,
      stdout: '',
      stderr: 'failed',
    })

    expect(
      buildServerCommandToolState({
        id: 'call-1',
        command: 'false',
        status: 'completed',
        output,
      }),
    ).toMatchObject({
      isError: true,
      output: {
        exitCode: 2,
      },
    })
  })

  test('repairs Paulus tool names without changing unknown names', () => {
    expect(normalizePaulusToolName('MCP__PAULUS__PAULUS_EXEC_SERVER_COMMAND')).toBe(
      'paulus_exec_server_command',
    )
    expect(normalizePaulusToolName('CustomTool')).toBe('CustomTool')
  })

  test('creates model-visible invalid tool states', () => {
    expect(
      buildInvalidToolState({
        id: 'invalid-1',
        toolName: 'bash',
        error: 'Use paulus_exec_server_command instead.',
      }),
    ).toMatchObject({
      id: 'invalid-1',
      kind: 'invalid',
      status: 'error',
      isError: true,
      error: 'Use paulus_exec_server_command instead.',
    })
  })
})
