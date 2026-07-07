import type { Keyring } from './keyring'
import type { KeyringStorage } from './storage'

/**
 * Passkey-encrypted keyring storage (WebAuthn PRF → HKDF → AES-256-GCM).
 *
 * The keyring is encrypted at rest in IndexedDB with an AES-256-GCM key derived
 * from a passkey's PRF output, unwrapped on demand with a biometric/PIN tap.
 * Decryption happens entirely client-side with the user present — no server,
 * no custodian.
 *
 * **Honest scope:** this protects against at-rest theft (stolen device,
 * storage-dumping extension, backups). It does NOT defeat live in-page XSS — an
 * attacker running JS in the origin after the user unlocks can read the
 * decrypted keys from memory.
 */

const STORE_NAME = 'keyring'
const RECORD_ID = 'default'
const HKDF_INFO = 'tanstack-byok:keyring:v1'
const DEFAULT_DB = 'tanstack-byok'

interface StoredRecord {
  id: string
  /** The passkey's raw credential id, replayed in the unlock ceremony. */
  credentialId: ArrayBuffer
  /** Fixed per-install PRF evaluation input (not secret). */
  salt: ArrayBuffer
  /** AES-GCM initialization vector for this ciphertext. */
  iv: ArrayBuffer
  /** Encrypted keyring JSON. */
  ciphertext: ArrayBuffer
}

/**
 * Whether the current environment exposes WebAuthn. Note that actual PRF
 * support can only be confirmed during registration; `passkeyStorage` throws a
 * descriptive error if the chosen authenticator does not support PRF, which the
 * caller should catch and fall back to {@link memoryStorage}.
 */
export function isPasskeyStorageSupported(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.PublicKeyCredential !== 'undefined' &&
    typeof globalThis.navigator !== 'undefined' &&
    typeof globalThis.navigator.credentials.create === 'function'
  )
}

// ---------------------------------------------------------------------------
// Crypto (exported for testing; the WebAuthn ceremony below feeds `deriveAesKey`)
// ---------------------------------------------------------------------------

/** Derive a non-extractable AES-256-GCM key from a 32-byte PRF output. */
export async function deriveAesKey(
  prfOutput: BufferSource,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptKeyring(
  key: CryptoKey,
  keys: Keyring,
): Promise<{ iv: ArrayBuffer; ciphertext: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(keys))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  )
  return { iv: iv.buffer, ciphertext }
}

export async function decryptKeyring(
  key: CryptoKey,
  iv: BufferSource,
  ciphertext: BufferSource,
): Promise<Keyring> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext))
  if (typeof parsed !== 'object' || parsed === null) return {}
  return parsed
}

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idbGet(dbName: string): Promise<StoredRecord | null> {
  return openDb(dbName).then(
    (db) =>
      new Promise((resolve, reject) => {
        const request = db
          .transaction(STORE_NAME, 'readonly')
          .objectStore(STORE_NAME)
          .get(RECORD_ID)
        request.onsuccess = () =>
          resolve((request.result as StoredRecord | undefined) ?? null)
        request.onerror = () => reject(request.error)
      }),
  )
}

function idbPut(dbName: string, record: StoredRecord): Promise<void> {
  return openDb(dbName).then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(record)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

function idbClear(dbName: string): Promise<void> {
  return openDb(dbName).then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(RECORD_ID)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

// ---------------------------------------------------------------------------
// WebAuthn ceremonies
// ---------------------------------------------------------------------------

function requirePublicKeyCredential(
  credential: Credential | null,
  action: string,
): PublicKeyCredential {
  if (!credential) throw new Error(`Passkey ${action} was cancelled`)
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error(`Unexpected credential type during ${action}`)
  }
  return credential
}

async function registerPasskey(
  rpName: string,
  userName: string,
  rpId?: string,
): Promise<{
  credentialId: ArrayBuffer
  salt: Uint8Array<ArrayBuffer>
  prf?: BufferSource
}> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const credential = requirePublicKeyCredential(
    await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        // Omit `id` to let the browser bind the passkey to the current origin's
        // effective domain; set it to scope across subdomains of a self-host.
        rp: rpId ? { name: rpName, id: rpId } : { name: rpName },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
        extensions: { prf: { eval: { first: salt } } },
      },
    }),
    'registration',
  )

  const prf = credential.getClientExtensionResults().prf
  if (!prf?.enabled) {
    throw new Error(
      'This authenticator does not support the WebAuthn PRF extension',
    )
  }
  return { credentialId: credential.rawId, salt, prf: prf.results?.first }
}

async function evaluatePrf(
  credentialId: BufferSource,
  salt: BufferSource,
): Promise<BufferSource> {
  const credential = requirePublicKeyCredential(
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: credentialId }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: salt } } },
      },
    }),
    'unlock',
  )
  const result = credential.getClientExtensionResults().prf?.results?.first
  if (!result) {
    throw new Error('Authenticator did not return a PRF result')
  }
  return result
}

// ---------------------------------------------------------------------------
// Storage strategy
// ---------------------------------------------------------------------------

export interface PasskeyStorageOptions {
  /** Relying-party name shown in the passkey prompt. */
  rpName?: string
  /** Username label attached to the created passkey. */
  userName?: string
  /**
   * WebAuthn Relying Party ID. Omit to bind the passkey to the current origin's
   * effective domain (the default — no central/hardcoded domain). Set it to a
   * registrable parent domain to share the credential across subdomains of your
   * own deployment. The encrypted keyring is never portable across unrelated
   * domains.
   */
  rpId?: string
  /** IndexedDB database name. Defaults to `tanstack-byok`. */
  dbName?: string
}

/**
 * Passkey-encrypted persistence. `<ByokProvider>` treats this as `unlockable`,
 * so nothing is decrypted until the user calls `unlock()` (or saves a key,
 * which registers a passkey on first use). The derived key is cached in memory
 * for the session so repeated saves don't re-prompt.
 */
export function passkeyStorage(
  options: PasskeyStorageOptions = {},
): KeyringStorage {
  const rpName = options.rpName ?? 'TanStack AI BYOK'
  const userName = options.userName ?? 'byok-keyring'
  const { rpId } = options
  const dbName = options.dbName ?? DEFAULT_DB

  let cachedKey: CryptoKey | null = null
  let cachedMeta: {
    credentialId: ArrayBuffer
    salt: Uint8Array<ArrayBuffer>
  } | null = null

  // Obtain the AES key, running exactly one WebAuthn ceremony if it isn't
  // already cached for this session (unlock if a passkey exists, else register).
  async function ensureKey(): Promise<{
    key: CryptoKey
    credentialId: ArrayBuffer
    salt: Uint8Array<ArrayBuffer>
  }> {
    if (cachedKey && cachedMeta) {
      return { key: cachedKey, ...cachedMeta }
    }
    const existing = await idbGet(dbName)
    if (existing) {
      const prf = await evaluatePrf(existing.credentialId, existing.salt)
      cachedKey = await deriveAesKey(prf)
      cachedMeta = {
        credentialId: existing.credentialId,
        salt: new Uint8Array(existing.salt),
      }
    } else {
      const reg = await registerPasskey(rpName, userName, rpId)
      const prf = reg.prf ?? (await evaluatePrf(reg.credentialId, reg.salt))
      cachedKey = await deriveAesKey(prf)
      cachedMeta = { credentialId: reg.credentialId, salt: reg.salt }
    }
    return { key: cachedKey, ...cachedMeta }
  }

  return {
    id: 'passkey',
    label: 'Passkey-encrypted (this device)',
    persistent: true,
    unlockable: true,
    warning:
      'Keys are encrypted with your passkey and unlocked with biometrics. ' +
      'This protects saved keys if your device is stolen, but not against code ' +
      'running on this page after you unlock.',
    load: async () => {
      const existing = await idbGet(dbName)
      if (!existing) return {} // nothing stored yet — no ceremony needed
      const { key } = await ensureKey()
      return decryptKeyring(key, existing.iv, existing.ciphertext)
    },
    save: async (keys) => {
      const { key, credentialId, salt } = await ensureKey()
      const { iv, ciphertext } = await encryptKeyring(key, keys)
      await idbPut(dbName, {
        id: RECORD_ID,
        credentialId,
        salt: salt.buffer,
        iv,
        ciphertext,
      })
    },
    clear: async () => {
      cachedKey = null
      cachedMeta = null
      await idbClear(dbName)
    },
  }
}
