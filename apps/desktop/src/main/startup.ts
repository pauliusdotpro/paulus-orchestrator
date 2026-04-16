export interface StartupHooks {
  createWindow(): Promise<void>
  registerIPCHandlers(): void
  warmRuntime(): Promise<unknown>
  warmShellEnv(): Promise<void>
  isPackaged: boolean
}

export async function bootstrapDesktopApp({
  createWindow,
  registerIPCHandlers,
  warmRuntime,
  warmShellEnv,
  isPackaged,
}: StartupHooks): Promise<void> {
  registerIPCHandlers()
  const windowPromise = createWindow()

  void warmRuntime().catch((error) => {
    console.error('[startup] Runtime warmup failed:', error)
  })

  if (isPackaged) {
    void warmShellEnv().catch((error) => {
      console.error('[startup] Shell env warmup failed:', error)
    })
  }

  await windowPromise
}
