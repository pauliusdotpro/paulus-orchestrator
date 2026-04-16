import { describe, expect, test } from 'bun:test'
import {
  buildDesktopShellEnvArgs,
  getDesktopUserShell,
  mergeDesktopShellEnv,
  parseDesktopShellEnv,
} from './shell-env'

describe('shell env bootstrap', () => {
  test('reads the full environment from an interactive login shell', () => {
    expect(buildDesktopShellEnvArgs()).toEqual(['-il', '-c', 'env -0'])
  })

  test('falls back to /bin/sh when SHELL is missing', () => {
    const originalShell = process.env.SHELL
    delete process.env.SHELL

    try {
      expect(getDesktopUserShell()).toBe('/bin/sh')
    } finally {
      if (originalShell === undefined) {
        delete process.env.SHELL
      } else {
        process.env.SHELL = originalShell
      }
    }
  })

  test('parses null-delimited shell environment variables', () => {
    const env = parseDesktopShellEnv(
      Buffer.from('PATH=/opt/homebrew/bin:/usr/bin\0FOO=bar=baz\0\0'),
    )

    expect(env.PATH).toBe('/opt/homebrew/bin:/usr/bin')
    expect(env.FOO).toBe('bar=baz')
  })

  test('ignores malformed shell environment entries', () => {
    const env = parseDesktopShellEnv(Buffer.from('INVALID\0=empty\0OK=1\0'))

    expect(env).toEqual({ OK: '1' })
  })

  test('keeps shell PATH while preserving explicit app environment values', () => {
    const env = mergeDesktopShellEnv(
      {
        PATH: '/opt/homebrew/bin:/usr/bin',
        HOME: '/Users/from-shell',
      },
      {
        PATH: '/usr/bin:/bin',
        PAULUS_DATA_PATH: '/tmp/paulus',
      },
    )

    expect(env.PATH).toBe('/opt/homebrew/bin:/usr/bin')
    expect(env.HOME).toBe('/Users/from-shell')
    expect(env.PAULUS_DATA_PATH).toBe('/tmp/paulus')
  })

  test('uses app environment when shell probing fails', () => {
    const env = mergeDesktopShellEnv(null, {
      PATH: '/usr/bin:/bin',
      PAULUS_DATA_PATH: '/tmp/paulus',
    })

    expect(env).toEqual({
      PATH: '/usr/bin:/bin',
      PAULUS_DATA_PATH: '/tmp/paulus',
    })
  })
})
