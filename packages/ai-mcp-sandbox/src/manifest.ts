import {
  createHash,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
} from 'node:crypto'
import type { Manifest } from './types'

/** Hex SHA-256 of a snippet's source. */
export function hashSnippet(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex')
}

/** Deterministic JSON: object keys sorted recursively so bytes are stable. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/** The exact bytes signed/verified: the manifest minus its `signature`. */
function signingBytes(manifest: Manifest): Buffer {
  const { signature: _signature, ...rest } = manifest
  return Buffer.from(canonicalize(rest), 'utf8')
}

/** Sign a manifest with a PEM Ed25519 private key; returns base64. */
export function signManifest(
  manifest: Manifest,
  privateKeyPem: string,
): string {
  return edSign(null, signingBytes(manifest), privateKeyPem).toString('base64')
}

/** True when `manifest.signature` is a valid Ed25519 signature for `publicKeyPem`. */
export function verifyManifest(
  manifest: Manifest,
  publicKeyPem: string,
): boolean {
  if (!manifest.signature) return false
  try {
    return edVerify(
      null,
      signingBytes(manifest),
      publicKeyPem,
      Buffer.from(manifest.signature, 'base64'),
    )
  } catch {
    return false
  }
}

/** Convenience for authoring/tests: a fresh Ed25519 keypair as PEM strings. */
export function generateManifestKeyPair(): {
  publicKey: string
  privateKey: string
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}
