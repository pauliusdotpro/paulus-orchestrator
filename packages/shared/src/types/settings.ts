import type { AIProviderType, AIProviderConfig } from './ai'

export type PanelLayout = 'split' | 'chat-only' | 'terminal-only'

export interface AppSettings {
  activeProvider: AIProviderType
  providers: AIProviderConfig[]
  theme: 'light' | 'dark' | 'system'
  terminalFontSize: number
  terminalFontFamily: string
  sidebarCollapsed: boolean
  panelLayout: PanelLayout
  terminalWidth: number
  anonymousMode: boolean
}
