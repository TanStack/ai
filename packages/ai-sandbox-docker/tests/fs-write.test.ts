import { describe, expect, it } from 'vitest'
import { FS_WRITE_BYTE_CHUNK, fsWriteCommands } from '../src/fs-write'

/** Linux `MAX_ARG_STRLEN` for one `exec` argument. */
const MAX_ARG_STRLEN = 131_072

function bytesFromCommands(commands: Array<string>): Buffer {
  const parts: Array<Buffer> = []
  for (const command of commands) {
    const match = /^printf %s '([^']*)' \| base64 -d >> /.exec(command)
    if (!match) continue
    parts.push(Buffer.from(match[1] ?? '', 'base64'))
  }
  return Buffer.concat(parts)
}

describe('fsWriteCommands', () => {
  it('creates an empty file with one truncate command', () => {
    const commands = fsWriteCommands('/workspace/empty.txt', '')
    expect(commands).toEqual([
      "mkdir -p '/workspace' && : > '/workspace/empty.txt'",
    ])
  })

  it('writes a small file as truncate then one decode', () => {
    const commands = fsWriteCommands('/workspace/note.txt', 'hello')
    expect(commands[0]).toBe(
      "mkdir -p '/workspace' && : > '/workspace/note.txt'",
    )
    expect(commands).toHaveLength(2)
    expect(bytesFromCommands(commands).toString('utf8')).toBe('hello')
  })

  it('splits a payload larger than one argv chunk', () => {
    const payload = Buffer.alloc(FS_WRITE_BYTE_CHUNK + 20, 0x61)
    const commands = fsWriteCommands('/workspace/big.txt', payload)
    expect(commands).toHaveLength(3)
    expect(bytesFromCommands(commands).equals(payload)).toBe(true)
    for (const command of commands) {
      expect(command.length).toBeLessThan(MAX_ARG_STRLEN)
    }
  })

  it('writes binary bytes without corrupting them', () => {
    const payload = new Uint8Array([0, 1, 2, 250, 255])
    const commands = fsWriteCommands('/workspace/bin', payload)
    expect(Uint8Array.from(bytesFromCommands(commands))).toEqual(payload)
  })
})
