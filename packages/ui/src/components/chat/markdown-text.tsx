import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import remarkGfm from 'remark-gfm'

const REMARK_PLUGINS = [remarkGfm]

export function MarkdownText() {
  return <MarkdownTextPrimitive className="aui-md-root" remarkPlugins={REMARK_PLUGINS} smooth />
}
