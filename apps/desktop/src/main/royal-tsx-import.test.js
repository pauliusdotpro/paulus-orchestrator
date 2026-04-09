import { describe, expect, test } from 'bun:test'
import { decryptRoyalTsxSecret, parseRoyalTsxDocument } from './royal-tsx-import'

const SHARED_SECRET_B64 =
  'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wVk6SOKeCDtffV3M8f5zl9f8fffyFY4skbUIv2+l27LQ='
const INLINE_SECRET_B64 =
  'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wVk6SOKeCDtffV3M8f5zl9dX3cqlbpJqObJ0N8mtedNc='

describe('Royal TSX import helpers', () => {
  test('decrypts a Royal TSX secret that uses a document password', () => {
    expect(decryptRoyalTsxSecret(SHARED_SECRET_B64, 'doc-password')).toBe('shared-secret')
  })

  test('parses shared and inline Royal SSH credentials and skips unsupported entries', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<RTSZDocument>
  <RoyalCredential>
    <ID>cred-1</ID>
    <Name>Shared credential</Name>
    <UserName>deploy</UserName>
    <Password>${SHARED_SECRET_B64}</Password>
  </RoyalCredential>
  <RoyalSSHConnection>
    <Name>shared-host</Name>
    <CredentialMode>3</CredentialMode>
    <CredentialId>cred-1</CredentialId>
    <CredentialKeyMode>0</CredentialKeyMode>
    <Port>22</Port>
    <URI>shared.example.com</URI>
  </RoyalSSHConnection>
  <RoyalSSHConnection>
    <Name>inline-host</Name>
    <CredentialMode>2</CredentialMode>
    <CredentialKeyMode>0</CredentialKeyMode>
    <CredentialUsername>root</CredentialUsername>
    <CredentialPassword>${INLINE_SECRET_B64}</CredentialPassword>
    <Port>2202</Port>
    <URI>inline.example.com</URI>
  </RoyalSSHConnection>
  <RoyalSSHConnection>
    <Name>missing-secret</Name>
    <CredentialMode>2</CredentialMode>
    <CredentialKeyMode>0</CredentialKeyMode>
    <CredentialUsername>ops</CredentialUsername>
    <CredentialPassword />
    <Port>22</Port>
    <URI>missing.example.com</URI>
  </RoyalSSHConnection>
  <RoyalRDSConnection>
    <Name>windows-desktop</Name>
  </RoyalRDSConnection>
</RTSZDocument>`

    const output = parseRoyalTsxDocument(xml, 'doc-password')

    expect(output.encryptedSecretCount).toBe(2)
    expect(output.servers).toEqual([
      {
        config: {
          name: 'shared-host',
          host: 'shared.example.com',
          port: 22,
          username: 'deploy',
          authMethod: 'password',
        },
        password: 'shared-secret',
      },
      {
        config: {
          name: 'inline-host',
          host: 'inline.example.com',
          port: 2202,
          username: 'root',
          authMethod: 'password',
        },
        password: 'inline-secret',
      },
    ])
    expect(output.skippedServers).toEqual([
      {
        name: 'missing-secret',
        reason: 'Only Royal SSH entries with a saved username and password are supported.',
      },
      {
        name: 'windows-desktop',
        reason: 'Only Royal SSH connections are supported.',
      },
    ])
  })

  test('decrypts without relying on aes-128-xts cipher support', () => {
    expect(() => decryptRoyalTsxSecret(SHARED_SECRET_B64, 'doc-password')).not.toThrow(
      'Unknown cipher',
    )
  })
})
