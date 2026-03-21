import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownText() {
  return <MarkdownTextPrimitive className="aui-md-root" remarkPlugins={[remarkGfm]} smooth />
}
