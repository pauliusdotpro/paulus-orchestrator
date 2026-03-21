interface PendingCommand {
  id: string
  command: string
  explanation: string
}

interface ApprovalBannerProps {
  commands: PendingCommand[]
  onApprove: (id: string) => void
  onReject: (id: string) => void
}

export function ApprovalBanner({ commands, onApprove, onReject }: ApprovalBannerProps) {
  return (
    <div className="border-t border-yellow-900/50 bg-yellow-950/30 px-4 py-3 space-y-3">
      {commands.map((cmd) => (
        <div key={cmd.id} className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-xs text-yellow-500 font-medium mt-0.5 flex-shrink-0">
              COMMAND
            </span>
            <code className="text-sm text-zinc-200 bg-zinc-800 px-2 py-1 rounded font-mono flex-1 break-all">
              {cmd.command}
            </code>
          </div>
          {cmd.explanation && <p className="text-xs text-zinc-400 pl-16">{cmd.explanation}</p>}
          <div className="flex gap-2 pl-16">
            <button
              onClick={() => onApprove(cmd.id)}
              className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-500"
            >
              Approve
            </button>
            <button
              onClick={() => onReject(cmd.id)}
              className="text-xs px-3 py-1.5 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
