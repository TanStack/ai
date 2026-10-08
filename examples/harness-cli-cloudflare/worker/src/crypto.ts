// Keys at rest: AES-GCM with a key made from the ENCRYPTION_KEY secret.

const keys = new Map<string, Promise<CryptoKey>>()

/** The AES key for `secret`: the SHA-256 of the secret. */
function keyFor(secret: string) {
  let key = keys.get(secret)
  if (!key) {
    key = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(secret))
      .then((bytes) =>
        crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
          'encrypt',
          'decrypt',
        ]),
      )
    keys.set(secret, key)
  }
  return key
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

/** Encrypt `text`. The result is `<iv>.<ciphertext>`, both base64. */
export async function seal(secret: string, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await keyFor(secret),
    new TextEncoder().encode(text),
  )
  return `${toBase64(iv)}.${toBase64(new Uint8Array(data))}`
}

/** Decrypt what {@link seal} made. A wrong secret throws. */
export async function unseal(secret: string, sealed: string) {
  const [iv = '', data = ''] = sealed.split('.')
  const text = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    await keyFor(secret),
    fromBase64(data),
  )
  return new TextDecoder().decode(text)
}
