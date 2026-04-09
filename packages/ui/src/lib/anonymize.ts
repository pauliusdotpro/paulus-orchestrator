/**
 * Anonymous mode helpers — mask sensitive connection details for screen
 * sharing, recordings, or demos. These intentionally preserve enough shape for
 * the user to still recognize the value (e.g. dotted quad vs hostname) without
 * exposing the actual characters.
 */

const IPV4_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

export function maskHost(host: string): string {
  if (!host) return host
  if (IPV4_PATTERN.test(host)) {
    return '***.***.***.***'
  }
  // Hostname — keep the top-level domain visible so users still know which
  // network they're on, and mask every other label.
  const labels = host.split('.')
  if (labels.length <= 1) {
    return '***'
  }
  const tld = labels[labels.length - 1]
  return `${labels
    .slice(0, -1)
    .map(() => '***')
    .join('.')}.${tld}`
}

export function maskUsername(username: string): string {
  if (!username) return username
  return '***'
}

export function maskPort(port: number): string {
  if (!port) return String(port)
  return '***'
}
