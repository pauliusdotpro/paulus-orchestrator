import { AcpBaseProvider } from './acp-base'

/**
 * Codex ACP provider — uses @zed-industries/codex-acp
 * to communicate with Codex via the Agent Client Protocol.
 *
 * Spawns the ACP agent as a subprocess, communicates via
 * JSON-RPC 2.0 over stdin/stdout. Tool executions are intercepted
 * and routed through the app's SSH command approval flow.
 */
export class CodexAcpProvider extends AcpBaseProvider {
  readonly name = 'codex-acp'
  protected readonly packageName = '@zed-industries/codex-acp'

  // Strip OpenAI/Codex env vars that might cause issues
  protected readonly stripEnvPrefixes = ['CODEX_']
  protected readonly stripEnvExact = []
}
