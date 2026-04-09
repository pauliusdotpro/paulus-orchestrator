import { createCipheriv, createDecipheriv, pbkdf2Sync } from 'node:crypto'
import type { RoyalTsxImportSkippedEntry, ServerConfig } from '@paulus/shared'

const STATIC_PREFIX = Buffer.from('jtWcgJq<MKE]@M#uH3yKZi]CznpP}?}VKr3r]h{<wkp%+FMwUz', 'utf-8')
const HEADER_TWEAK = Buffer.from('ffffffffffffffff0000000000000000', 'hex')
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

interface ParsedRoyalTsxServer {
  config: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>
  password: string
}

export interface ParsedRoyalTsxDocument {
  servers: ParsedRoyalTsxServer[]
  encryptedSecretCount: number
  skippedServers: RoyalTsxImportSkippedEntry[]
}

interface RoyalCredentialRecord {
  name: string
  username: string
  password: string
}

export function decryptRoyalTsxSecret(ciphertextBase64: string, documentPassword = ''): string {
  if (!ciphertextBase64) {
    return ''
  }

  const ciphertext = Buffer.from(ciphertextBase64, 'base64')
  if (ciphertext.length < 64) {
    throw new Error('Ciphertext is too short.')
  }

  const salt = ciphertext.subarray(0, 48)
  const encryptedHeader = ciphertext.subarray(48, 64)
  const encryptedBody = ciphertext.subarray(64)
  const passwordBytes = Buffer.concat([STATIC_PREFIX, Buffer.from(documentPassword, 'utf-8')])
  const xtsKey = pbkdf2Sync(passwordBytes, salt.subarray(0, 40), 1000, 32, 'sha1')
  const header = decryptXtsDataUnit(xtsKey, HEADER_TWEAK, encryptedHeader)

  if (header.subarray(0, 4).toString('utf-8') !== 'XTS1') {
    throw new Error('Invalid Royal TSX secret header.')
  }

  const textLength = Number(header.readBigUInt64LE(4))
  const blockSize = header.readUInt32LE(12)
  if (blockSize <= 0 || blockSize % 16 !== 0) {
    throw new Error(`Invalid Royal TSX block size: ${blockSize}.`)
  }

  const decryptedChunks: Buffer[] = []
  for (let chunkIndex = 0; chunkIndex * blockSize < encryptedBody.length; chunkIndex += 1) {
    const tweak = Buffer.alloc(16)
    tweak.writeBigUInt64LE(BigInt(chunkIndex), 0)
    const chunk = encryptedBody.subarray(chunkIndex * blockSize, (chunkIndex + 1) * blockSize)
    decryptedChunks.push(decryptXtsDataUnit(xtsKey, tweak, chunk))
  }

  return Buffer.concat(decryptedChunks).subarray(0, textLength).toString('utf-8')
}

export function parseRoyalTsxDocument(xml: string, documentPassword = ''): ParsedRoyalTsxDocument {
  const credentialMap = new Map<string, RoyalCredentialRecord>()
  let encryptedSecretCount = 0

  for (const block of extractBlocks(xml, 'RoyalCredential')) {
    const id = getField(block, 'ID')
    if (!id) {
      continue
    }

    const encryptedPassword = getField(block, 'Password')
    if (encryptedPassword) {
      encryptedSecretCount += 1
    }

    credentialMap.set(id, {
      name: getField(block, 'Name'),
      username: getField(block, 'UserName'),
      password: decryptSecretOrThrow(
        encryptedPassword,
        documentPassword,
        `Royal credential "${getField(block, 'Name') || id}"`,
      ),
    })
  }

  const servers: ParsedRoyalTsxServer[] = []
  const skippedServers: RoyalTsxImportSkippedEntry[] = []

  for (const match of xml.matchAll(/<(Royal[A-Za-z]+Connection)>([\s\S]*?)<\/\1>/g)) {
    const tagName = match[1]
    const block = match[2]
    const name = getField(block, 'Name') || tagName

    if (tagName !== 'RoyalSSHConnection') {
      skippedServers.push({
        name,
        reason: 'Only Royal SSH connections are supported.',
      })
      continue
    }

    const host = getField(block, 'URI')
    if (!host) {
      skippedServers.push({
        name,
        reason: 'Royal SSH connection is missing a host.',
      })
      continue
    }

    const portText = getField(block, 'Port')
    const port = Number.parseInt(portText || '22', 10)
    if (!Number.isInteger(port) || port <= 0) {
      skippedServers.push({
        name,
        reason: `Royal SSH connection has an invalid port: "${portText}".`,
      })
      continue
    }

    const credentialKeyMode = getField(block, 'CredentialKeyMode')
    if (credentialKeyMode && credentialKeyMode !== '0') {
      skippedServers.push({
        name,
        reason: 'SSH key-based Royal credentials are not supported.',
      })
      continue
    }

    const credentialMode = getField(block, 'CredentialMode')
    if (credentialMode === '2') {
      const username = getField(block, 'CredentialUsername')
      const encryptedPassword = getField(block, 'CredentialPassword')

      if (encryptedPassword) {
        encryptedSecretCount += 1
      }

      if (!username || !encryptedPassword) {
        skippedServers.push({
          name,
          reason: 'Only Royal SSH entries with a saved username and password are supported.',
        })
        continue
      }

      servers.push({
        config: {
          name,
          host,
          port,
          username,
          authMethod: 'password',
        },
        password: decryptSecretOrThrow(
          encryptedPassword,
          documentPassword,
          `Royal SSH connection "${name}"`,
        ),
      })
      continue
    }

    if (credentialMode === '3') {
      const credentialId = getField(block, 'CredentialId')
      if (!credentialId || credentialId === EMPTY_UUID) {
        skippedServers.push({
          name,
          reason: 'Royal SSH connection references a missing shared credential.',
        })
        continue
      }

      const credential = credentialMap.get(credentialId)
      if (!credential || !credential.username || !credential.password) {
        skippedServers.push({
          name,
          reason: 'Royal SSH connection references a shared credential without a saved password.',
        })
        continue
      }

      servers.push({
        config: {
          name,
          host,
          port,
          username: credential.username,
          authMethod: 'password',
        },
        password: credential.password,
      })
      continue
    }

    skippedServers.push({
      name,
      reason: `Unsupported Royal SSH credential mode: "${credentialMode || 'missing'}".`,
    })
  }

  return {
    servers,
    encryptedSecretCount,
    skippedServers,
  }
}

function decryptSecretOrThrow(
  ciphertextBase64: string,
  documentPassword: string,
  context: string,
): string {
  if (!ciphertextBase64) {
    return ''
  }

  try {
    return decryptRoyalTsxSecret(ciphertextBase64, documentPassword)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to decrypt ${context}: ${message}`)
  }
}

function extractBlocks(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'g')
  return [...xml.matchAll(pattern)].map((match) => match[1])
}

function getField(block: string, tagName: string): string {
  if (new RegExp(`<${tagName}\\s*/>`).test(block)) {
    return ''
  }

  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`))
  return decodeXmlText(match?.[1] ?? '')
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

function decryptXtsDataUnit(key: Buffer, tweakInput: Buffer, ciphertext: Buffer): Buffer {
  if (ciphertext.length % 16 !== 0) {
    throw new Error('Royal TSX ciphertext chunk is not aligned to 16 bytes.')
  }

  const dataKey = key.subarray(0, 16)
  const tweakKey = key.subarray(16, 32)
  let tweak = encryptAesBlock(tweakKey, tweakInput)
  const plaintextBlocks: Buffer[] = []

  for (let offset = 0; offset < ciphertext.length; offset += 16) {
    const block = ciphertext.subarray(offset, offset + 16)
    const mixedCiphertext = xorBlock(block, tweak)
    const decrypted = decryptAesBlock(dataKey, mixedCiphertext)
    plaintextBlocks.push(xorBlock(decrypted, tweak))
    tweak = multiplyTweakByX(tweak)
  }

  return Buffer.concat(plaintextBlocks)
}

function encryptAesBlock(key: Buffer, block: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null)
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(block), cipher.final()])
}

function decryptAesBlock(key: Buffer, block: Buffer): Buffer {
  const decipher = createDecipheriv('aes-128-ecb', key, null)
  decipher.setAutoPadding(false)
  return Buffer.concat([decipher.update(block), decipher.final()])
}

function xorBlock(left: Buffer, right: Buffer): Buffer {
  const output = Buffer.alloc(16)
  for (let index = 0; index < 16; index += 1) {
    output[index] = left[index] ^ right[index]
  }

  return output
}

function multiplyTweakByX(tweak: Buffer): Buffer {
  const next = Buffer.from(tweak)
  let carry = 0

  for (let index = 0; index < 16; index += 1) {
    const value = next[index]
    next[index] = ((value << 1) & 0xff) | carry
    carry = value & 0x80 ? 1 : 0
  }

  if (carry) {
    next[0] ^= 0x87
  }

  return next
}
