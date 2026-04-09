import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RoyalTsxImportDialog, syncRoyalTsxImportState } from './settings-view'

describe('RoyalTsxImportDialog', () => {
  test('renders the in-app password dialog for Royal TSX import', () => {
    const html = renderToStaticMarkup(
      createElement(RoyalTsxImportDialog, {
        documentPassword: '',
        busyAction: null,
        onPasswordChange: () => {},
        onCancel: () => {},
        onSubmit: async () => {},
      }),
    )

    expect(html).toContain('Royal TSX Document Password')
    expect(html).toContain('Choose File')
    expect(html).toContain('Leave blank if the document has no password')
  })

  test('reloads the server store after a Royal TSX import succeeds', async () => {
    const calls = []
    const overview = {
      dataDirectory: '/tmp/paulus',
      serversFile: '/tmp/paulus/servers.json',
      settingsFile: '/tmp/paulus/settings.json',
      credentialsFile: '/tmp/paulus/credentials.json',
      sessionFilePattern: '/tmp/paulus/sessions/<server-id>/<session-id>.json',
      sessionIndexFilePattern: '/tmp/paulus/sessions/<server-id>/index.json',
      serverCount: 3,
      savedPasswordCount: 3,
      sessionCount: 0,
      passwordStorageMode: 'safe-storage',
      passwordStorageOptions: [],
    }
    let receivedOverview = null

    await syncRoyalTsxImportState({
      bridge: {
        appData: {
          getOverview: async () => {
            calls.push('getOverview')
            return overview
          },
        },
      },
      loadServers: async () => {
        calls.push('loadServers')
      },
      setAppDataOverview: (value) => {
        calls.push('setAppDataOverview')
        receivedOverview = value
      },
    })

    expect(calls).toEqual(['loadServers', 'getOverview', 'setAppDataOverview'])
    expect(receivedOverview).toEqual(overview)
  })
})
