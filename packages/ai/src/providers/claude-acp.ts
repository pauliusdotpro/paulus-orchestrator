import { AcpBaseProvider } from './acp-base'

/**
 * Claude ACP provider — uses @zed-industries/claude-agent-acp
 * to communicate with Claude via the Agent Client Protocol.
 *
 * Spawns the ACP agent as a subprocess, communicates via
 * JSON-RPC 2.0 over stdin/stdout. Tool executions are intercepted
 * and routed through the app's SSH command approval flow.
 */
export class ClaudeAcpProvider extends AcpBaseProvider {
  readonly name = 'claude-acp'
  protected readonly packageName = '@zed-industries/claude-agent-acp'

  // Strip Claude/Anthropic env vars to avoid nested session detection
  protected readonly stripEnvPrefixes = ['CLAUDE', 'ANTHROPIC']
  protected readonly stripEnvExact = ['CLAUDECODE']
}
