import { describe, expect, test } from 'bun:test'
import {
  buildInspectionInstruction,
  detectExecutionScope,
  isLocalShellToolName,
  isPaulusServerCommandToolName,
  isPaulusToolName,
} from './execution-scope'

describe('execution-scope', () => {
  test('forces remote inspection for runtime version questions without hardcoding the service', () => {
    const instruction = buildInspectionInstruction('what version teamspeak is running')

    expect(instruction).toContain('remote-server inspection request')
    expect(instruction).toContain('paulus_exec_server_command')
    expect(instruction).toContain('Do not answer from local runtime context')
    expect(instruction).not.toContain('teamspeak|ts3server')
  })

  test('forces remote inspection for generic server state checks', () => {
    const instruction = buildInspectionInstruction('check nginx status')

    expect(instruction).toContain('remote-server inspection request')
    expect(instruction).toContain('paulus_exec_server_command')
  })

  test('recognizes only Paulus remote command execution tools as remote command tools', () => {
    expect(isPaulusServerCommandToolName('paulus_exec_server_command')).toBe(true)
    expect(isPaulusServerCommandToolName('MCP__PAULUS__PAULUS_EXEC_SERVER_COMMAND')).toBe(true)
    expect(isPaulusServerCommandToolName('bash')).toBe(false)
    expect(isPaulusServerCommandToolName('terminal/execute')).toBe(false)
  })

  test('still recognizes Paulus tool namespaces for permission handling', () => {
    expect(isPaulusToolName('paulus_get_server_context')).toBe(true)
    expect(isPaulusToolName('MCP__PAULUS__PAULUS_EXEC_SERVER_COMMAND')).toBe(true)
    expect(isPaulusToolName('bash')).toBe(false)
  })

  test('defaults execution scope to remote unless the user explicitly says local', () => {
    expect(detectExecutionScope('what version teamspeak is running')).toBe('remote')
    expect(detectExecutionScope('on my local macos run ps aux')).toBe('local')
  })

  test('treats bare "workspace" mentions about the remote server as remote scope', () => {
    expect(detectExecutionScope('check the workspace directory on the server')).toBe('remote')
    expect(detectExecutionScope('list workspace files in /var/app')).toBe('remote')
  })

  test('still recognizes possessive workspace phrasing as local scope', () => {
    expect(detectExecutionScope('open my workspace and run tests')).toBe('local')
    expect(detectExecutionScope('build the current workspace')).toBe('local')
  })

  test('recognizes local shell tool names separately from remote server tools', () => {
    expect(isLocalShellToolName('bash')).toBe(true)
    expect(isLocalShellToolName('terminal/execute')).toBe(true)
    expect(isLocalShellToolName('paulus_exec_server_command')).toBe(false)
  })
})
