// Dependency-free SHA-256 (FIPS 180-4). Sync and isomorphic (Node + browser)
// so interrupt hashing needs no crypto library. Users can replace the whole
// algorithm through the `interrupts.hash` option; this is only the default.
// ponytail: bundled ~60-line hash, swap via interrupts.hash if you need more.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

function sha256Hex(input: string): string {
  const msg = new TextEncoder().encode(input)

  const bitLen = msg.length * 8
  const withOne = msg.length + 1
  const total = withOne + ((56 - (withOne % 64) + 64) % 64) + 8
  const bytes = new Uint8Array(total)
  bytes.set(msg)
  bytes[msg.length] = 0x80
  const view = new DataView(bytes.buffer)
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000))
  view.setUint32(total - 4, bitLen >>> 0)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const w = new Uint32Array(64)
  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const x15 = w[i - 15] ?? 0
      const x2 = w[i - 2] ?? 0
      const s0 = rotr(x15, 7) ^ rotr(x15, 18) ^ (x15 >>> 3)
      const s1 = rotr(x2, 17) ^ rotr(x2, 19) ^ (x2 >>> 10)
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let hh = h7
    for (let i = 0; i < 64; i++) {
      const bigS1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + bigS1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0
      const bigS0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (bigS0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + hh) >>> 0
  }

  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0')
  return (
    hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7)
  )
}

/**
 * A hash function for interrupt bindings and resolution fingerprints. Receives
 * canonical JSON text and returns an opaque string. Must be deterministic; the
 * server compares hashes it computed against the ones in a binding, so the same
 * function has to run wherever a given binding is produced and checked.
 */
export type InterruptHash = (canonicalJson: string) => string

/** The built-in default: SHA-256, prefixed so the algorithm is self-describing. */
export function defaultInterruptHash(canonicalJson: string): string {
  return `sha256:${sha256Hex(canonicalJson)}`
}

function canonical(value: unknown, active: WeakSet<object>): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return JSON.stringify(value)
  }
  if (typeof value !== 'object') {
    throw new TypeError('Interrupt values must be JSON-compatible.')
  }
  if (active.has(value)) {
    throw new TypeError('Interrupt values must not cycle.')
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new TypeError('Interrupt values must use plain JSON objects.')
  }

  active.add(value)
  let encoded: string
  if (Array.isArray(value)) {
    const items: Array<string> = []
    for (let index = 0; index < value.length; index++) {
      items.push(canonical(value[index], active))
    }
    encoded = `[${items.join(',')}]`
  } else {
    const record = value as Record<string, unknown>
    encoded = `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key], active)}`)
      .join(',')}}`
  }
  active.delete(value)
  return encoded
}

export function canonicalInterruptJson(value: unknown): string {
  return canonical(value, new WeakSet<object>())
}

export function digestInterruptJson(
  canonicalJson: string,
  hash: InterruptHash = defaultInterruptHash,
): string {
  if (typeof canonicalJson !== 'string') {
    throw new TypeError('Interrupt digests require canonical JSON text.')
  }
  return hash(canonicalJson)
}

function freezeTree(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return
  }
  Object.values(value).forEach(freezeTree)
  Object.freeze(value)
}

export function cloneAndDeepFreezeJson<T>(value: T): T {
  const clone: T = JSON.parse(canonicalInterruptJson(value))
  freezeTree(clone)
  return clone
}
