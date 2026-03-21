import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

const workspacePackages = [
  '@paulus/shared',
  '@paulus/bridge',
  '@paulus/ai',
  '@paulus/core',
  '@paulus/ui',
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    resolve: {
      alias: {
        '@paulus/shared': resolve(__dirname, '../../packages/shared/src'),
        '@paulus/ai': resolve(__dirname, '../../packages/ai/src'),
        '@paulus/core': resolve(__dirname, '../../packages/core/src'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    resolve: {
      alias: {
        '@paulus/shared': resolve(__dirname, '../../packages/shared/src'),
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@paulus/shared': resolve(__dirname, '../../packages/shared/src'),
        '@paulus/bridge': resolve(__dirname, '../../packages/bridge/src'),
        '@paulus/ui': resolve(__dirname, '../../packages/ui/src'),
      },
    },
  },
})
