import {
  PAULUS_SERVER_COMMAND_TOOL,
  normalizePaulusToolName,
  normalizeToolName,
} from './tool-state'

const OBSERVATION_KEYWORDS = [
  'version',
  'running',
  'status',
  'process',
  'service',
  'disk',
  'memory',
  'cpu',
  'uptime',
  'port',
  'package',
  'installed',
  'logs',
  'docker',
  'container',
]

const LOCAL_SCOPE_PATTERNS = [
  /\blocal\b/i,
  /\blocalhost\b/i,
  /\bmy\s+(mac|macos|machine|laptop|computer|host)\b/i,
  /\bthis\s+(mac|machine|host)\b/i,
  /\bhost\s+machine\b/i,
  /\bworkspace\b/i,
  /\bcurrent\s+repo\b/i,
  /\bon\s+my\s+computer\b/i,
]

export function isPaulusToolName(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)

  return (
    normalized.startsWith('paulus_') ||
    normalized.includes('__paulus__') ||
    normalized.includes('mcp__paulus') ||
    normalized.includes('paulus_exec_server_command') ||
    normalized.includes('paulus_get_server_context')
  )
}

export function isPaulusServerCommandToolName(toolName: string): boolean {
  return normalizePaulusToolName(toolName) === PAULUS_SERVER_COMMAND_TOOL
}

export function isLocalShellToolName(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)

  return (
    normalized === 'bash' ||
    normalized === 'shell' ||
    normalized === 'exec' ||
    normalized === 'terminal/execute' ||
    normalized === 'terminal/run' ||
    normalized === 'tools/execute'
  )
}

export function detectExecutionScope(prompt: string): 'remote' | 'local' {
  return LOCAL_SCOPE_PATTERNS.some((pattern) => pattern.test(prompt)) ? 'local' : 'remote'
}

export function buildInspectionInstruction(prompt: string): string | null {
  const normalized = prompt.toLowerCase()
  const scopeInstruction =
    'Unless the user explicitly says local, localhost, host machine, macOS, laptop, workspace, or current repo, assume they mean the selected remote server.'

  if (
    /(what|which).*(linux|os|distro|distribution|kernel)/.test(normalized) ||
    /(linux|os|distro|kernel).*(running|version)/.test(normalized)
  ) {
    return (
      'MANDATORY TOOL USE FOR THIS REQUEST: ' +
      `${scopeInstruction} ` +
      'Call paulus_exec_server_command with exactly "cat /etc/os-release && uname -srmo" before any answer. ' +
      'Do not answer from local runtime context. An answer without that tool result is invalid.'
    )
  }

  if (looksLikeObservationQuery(normalized)) {
    return (
      'MANDATORY TOOL USE FOR THIS REQUEST: ' +
      `${scopeInstruction} ` +
      'This is a remote-server inspection request. Before any answer, call paulus_exec_server_command on the selected server. ' +
      'Do not answer from local runtime context or use built-in Bash/terminal tools. An answer without tool results is invalid.'
    )
  }

  return null
}

function looksLikeObservationQuery(prompt: string): boolean {
  if (!/[?]/.test(prompt) && !/^(check|show|what|which|is|are|list|find)\b/.test(prompt)) {
    return false
  }

  return OBSERVATION_KEYWORDS.some((keyword) => prompt.includes(keyword))
}
