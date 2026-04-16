import { describe, expect, test } from 'bun:test'
import { bootstrapDesktopApp } from './startup'

function createDeferred() {
  let resolve
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

describe('desktop startup bootstrap', () => {
  test('does not wait for runtime warming before the window can finish loading', async () => {
    const runtime = createDeferred()
    const calls = []

    await bootstrapDesktopApp({
      isPackaged: false,
      registerIPCHandlers() {
        calls.push('register')
      },
      warmRuntime() {
        calls.push('runtime:start')
        return runtime.promise
      },
      warmShellEnv() {
        calls.push('shell:start')
        return Promise.resolve()
      },
      async createWindow() {
        calls.push('window:create')
      },
    })

    expect(calls).toEqual(['register', 'window:create', 'runtime:start'])
    runtime.resolve()
  })

  test('starts packaged shell env warming without blocking window creation', async () => {
    const runtime = createDeferred()
    const shellEnv = createDeferred()
    const calls = []

    await bootstrapDesktopApp({
      isPackaged: true,
      registerIPCHandlers() {
        calls.push('register')
      },
      warmRuntime() {
        calls.push('runtime:start')
        return runtime.promise
      },
      warmShellEnv() {
        calls.push('shell:start')
        return shellEnv.promise
      },
      async createWindow() {
        calls.push('window:create')
      },
    })

    expect(calls).toEqual(['register', 'window:create', 'runtime:start', 'shell:start'])
    runtime.resolve()
    shellEnv.resolve()
  })
})
