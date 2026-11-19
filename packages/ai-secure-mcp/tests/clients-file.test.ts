import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clientsFromFile } from '../src/clients-file'

async function writeClients(value: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'clients-'))
  const path = join(dir, 'clients.json')
  await writeFile(path, JSON.stringify(value), 'utf8')
  return path
}

const base = {
  id: 'alice',
  tokenHash: 'a'.repeat(64),
  scopes: ['read'],
}

describe('clientsFromFile', () => {
  it('reads a well-formed clients file', async () => {
    const path = await writeClients([
      { ...base, targets: ['den'], expiresAt: 1700000000 },
    ])
    const clients = await clientsFromFile(path)
    expect(clients).toEqual([
      {
        id: 'alice',
        tokenHash: 'a'.repeat(64),
        scopes: ['read'],
        targets: ['den'],
        expiresAt: 1700000000,
      },
    ])
  })

  it('allows an absent targets and expiresAt', async () => {
    const path = await writeClients([base])
    const [client] = await clientsFromFile(path)
    expect(client?.targets).toBeUndefined()
    expect(client?.expiresAt).toBeUndefined()
  })

  it('rejects a malformed targets instead of dropping the restriction', async () => {
    const path = await writeClients([{ ...base, targets: 'den' }])
    await expect(clientsFromFile(path)).rejects.toMatchObject({
      code: 'invalid_input',
    })
  })

  it('rejects a targets array that holds a non-string', async () => {
    const path = await writeClients([{ ...base, targets: ['den', 5] }])
    await expect(clientsFromFile(path)).rejects.toMatchObject({
      code: 'invalid_input',
    })
  })

  it('rejects a malformed expiresAt instead of dropping the expiry', async () => {
    const path = await writeClients([{ ...base, expiresAt: '1700000000' }])
    await expect(clientsFromFile(path)).rejects.toMatchObject({
      code: 'invalid_input',
    })
  })

  it('rejects a non-finite expiresAt', async () => {
    // JSON has no Infinity, so a non-finite value arrives as a string or null;
    // both are non-number and rejected. Guard the finite check directly too.
    const path = await writeClients([{ ...base, expiresAt: null }])
    await expect(clientsFromFile(path)).rejects.toMatchObject({
      code: 'invalid_input',
    })
  })
})
