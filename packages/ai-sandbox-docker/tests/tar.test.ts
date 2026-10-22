import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tarStream } from '../src/tar'
import type { TarEntry } from '../src/tar'

const BLOCK = 512

/** The test that lists an archive with a real tar runs only when one is on PATH. */
const hasTar = spawnSync('tar', ['--version']).status === 0

/** One member as a tar reader sees it, after its PAX records are applied. */
type ReadEntry = {
  path: string
  type: string
  mode: number
  uid: number
  gid: number
  mtime: number
  linkTarget: string
  data: Buffer
}

/** A text field ends at its first NUL, or fills the whole field. */
function readText(block: Buffer, offset: number, length: number) {
  const field = block.subarray(offset, offset + length)
  const end = field.indexOf(0)
  // latin1 keeps the raw bytes, so a non-ASCII name reads right only from PAX.
  return field.toString('latin1', 0, end === -1 ? length : end)
}

/** A numeric field is octal digits, then NUL or space. */
function readOctal(block: Buffer, offset: number, length: number) {
  const field = block.toString('latin1', offset, offset + length)
  expect(field.replaceAll('\0', ' ')).toMatch(/^[0-7]+ +$/)
  return parseInt(field, 8)
}

/** The sum of all header bytes, with the checksum field read as spaces. */
function checksumOf(header: Buffer) {
  return Buffer.from(header)
    .fill(' ', 148, 156)
    .reduce((sum, byte) => sum + byte, 0)
}

/** PAX records are `<length> <key>=<value>\n`. The length counts itself. */
function readPax(data: Buffer) {
  const records = new Map<string, string>()
  let offset = 0
  while (offset < data.length) {
    const space = data.indexOf(' ', offset)
    const length = Number(data.toString('latin1', offset, space))
    const record = data.subarray(offset, offset + length)
    expect(record.at(-1)).toBe(0x0a)
    const text = record.toString('utf8', space - offset + 1, length - 1)
    const equals = text.indexOf('=')
    records.set(text.slice(0, equals), text.slice(equals + 1))
    offset += length
  }
  expect(offset).toBe(data.length)
  return records
}

/**
 * A small tar reader that does not trust the writer. It checks each header's
 * checksum, magic, and octal fields, the zeros after the data, and the two
 * zero blocks at the end.
 */
function readTar(archive: Buffer) {
  const entries: Array<ReadEntry> = []
  let pax = new Map<string, string>()
  let offset = 0
  for (;;) {
    const header = archive.subarray(offset, offset + BLOCK)
    offset += BLOCK
    if (header.every((byte) => byte === 0)) break
    expect(readOctal(header, 148, 8)).toBe(checksumOf(header))
    expect(header.toString('latin1', 257, 263)).toBe('ustar\0')
    expect(header.toString('latin1', 263, 265)).toBe('00')
    const size = readOctal(header, 124, 12)
    const data = archive.subarray(offset, offset + size)
    const end = offset + Math.ceil(size / BLOCK) * BLOCK
    const padding = archive.subarray(offset + size, end)
    expect(padding.every((byte) => byte === 0)).toBe(true)
    offset = end
    const type = header.toString('latin1', 156, 157)
    if (type === 'x') {
      pax = readPax(data)
      continue
    }
    entries.push({
      path: pax.get('path') ?? readText(header, 0, 100),
      type,
      mode: readOctal(header, 100, 8),
      uid: readOctal(header, 108, 8),
      gid: readOctal(header, 116, 8),
      mtime: readOctal(header, 136, 12),
      linkTarget: pax.get('linkpath') ?? readText(header, 157, 100),
      data,
    })
    pax = new Map()
  }
  // The loop read the first zero block. The second one is the last block.
  expect(archive.subarray(offset)).toEqual(Buffer.alloc(BLOCK))
  return entries
}

function file(path: string, text: string, mode = 0o644) {
  return { path, mode, data: Buffer.from(text) }
}

async function roundTrip(
  entries: Iterable<TarEntry> | AsyncIterable<TarEntry>,
) {
  return readTar(await buffer(tarStream(entries)))
}

describe('tarStream', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes a file with its mode, a root owner, and the stream time', async () => {
    vi.setSystemTime(new Date('2026-01-02T03:04:05Z'))
    expect(await roundTrip([file('src/index.ts', 'export {}\n')])).toEqual([
      {
        path: 'src/index.ts',
        type: '0',
        mode: 0o644,
        uid: 0,
        gid: 0,
        mtime: 1_767_323_045,
        linkTarget: '',
        data: Buffer.from('export {}\n'),
      },
    ])
  })

  it('writes no data block for an empty file', async () => {
    const archive = await buffer(tarStream([file('empty.txt', '')]))
    // The header, then the two zero blocks.
    expect(archive.length).toBe(3 * BLOCK)
    expect(readTar(archive)).toMatchObject([
      { path: 'empty.txt', type: '0', data: Buffer.alloc(0) },
    ])
  })

  it('adds no padding to data that fills whole blocks', async () => {
    const text = 'a'.repeat(2 * BLOCK)
    const archive = await buffer(tarStream([file('blocks.txt', text)]))
    // The header, two data blocks, then the two zero blocks.
    expect(archive.length).toBe(5 * BLOCK)
    expect(readTar(archive)).toMatchObject([
      { path: 'blocks.txt', data: Buffer.from(text) },
    ])
  })

  it('keeps a path over 100 bytes', async () => {
    const path = `${'d'.repeat(50)}/${'f'.repeat(50)}`
    expect(await roundTrip([file(path, 'x')])).toMatchObject([
      { path, data: Buffer.from('x') },
    ])
  })

  it('keeps a path with spaces and non-ASCII characters', async () => {
    expect(await roundTrip([file('src/naïve file.ts', 'x')])).toMatchObject([
      { path: 'src/naïve file.ts', data: Buffer.from('x') },
    ])
  })

  it('writes a symlink with its target and no data', async () => {
    expect(
      await roundTrip([{ path: 'link', linkTarget: 'src/index.ts' }]),
    ).toMatchObject([
      {
        path: 'link',
        type: '2',
        linkTarget: 'src/index.ts',
        data: Buffer.alloc(0),
      },
    ])
  })

  it('keeps a symlink target over 100 bytes', async () => {
    const linkTarget = `${'../'.repeat(40)}target`
    expect(await roundTrip([{ path: 'link', linkTarget }])).toMatchObject([
      { path: 'link', type: '2', linkTarget },
    ])
  })

  it('keeps only the permission bits of the mode', async () => {
    // fs.stat gives 0o100755 for an executable file: the file type, then 0o755.
    expect(
      await roundTrip([file('bin/run.sh', '#!/bin/sh\n', 0o100755)]),
    ).toMatchObject([{ path: 'bin/run.sh', mode: 0o755 }])
  })

  it('writes many files from an async iterable', async () => {
    const files = Array.from({ length: 50 }, (_, index) =>
      file(`dir/file-${index}.txt`, `file ${index}\n`),
    )
    async function* readFiles() {
      for (const entry of files) {
        await Promise.resolve()
        yield entry
      }
    }
    expect(await roundTrip(readFiles())).toMatchObject(files)
  })

  it('pulls entries only as the stream is read', async () => {
    const total = 10_000
    let pulled = 0
    async function* manyFiles() {
      while (pulled < total) {
        pulled++
        yield file(`file-${pulled}.txt`, 'x')
      }
    }
    const stream = tarStream(manyFiles())
    await once(stream, 'readable')
    stream.destroy()
    expect(pulled).toBeLessThan(total)
  })

  it('destroys the stream with the error from the iterable', async () => {
    const failure = new Error('read failed')
    async function* failAfterOne() {
      yield file('first.txt', 'x')
      throw failure
    }
    const stream = tarStream(failAfterOne())
    await expect(buffer(stream)).rejects.toBe(failure)
    expect(stream.destroyed).toBe(true)
  })

  it.skipIf(!hasTar)(
    'writes an archive that the system tar can list',
    async () => {
      const longPath = `${'d'.repeat(60)}/${'f'.repeat(60)}`
      const longTarget = 't'.repeat(120)
      const archive = await buffer(
        tarStream([
          file('hello', 'hello\n'),
          file('bin/run', '#!/bin/sh\n', 0o755),
          file('empty', ''),
          file(longPath, 'x'),
          { path: 'link', linkTarget: 'hello' },
          { path: 'far', linkTarget: longTarget },
        ]),
      )
      const dir = await mkdtemp(join(tmpdir(), 'tanstack-tar-'))
      try {
        await writeFile(join(dir, 'test.tar'), archive)
        // A relative name, so GNU tar does not read `C:` as a remote host.
        const listing = spawnSync('tar', ['-tvf', 'test.tar'], {
          cwd: dir,
          encoding: 'utf8',
        })
        expect(listing.stderr).toBe('')
        expect(listing.status).toBe(0)
        expect(listing.stdout.trim().split(/\r?\n/)).toEqual([
          expect.stringMatching(/^-rw-r--r-- .* hello$/),
          expect.stringMatching(/^-rwxr-xr-x .* bin\/run$/),
          expect.stringMatching(/^-rw-r--r-- .* empty$/),
          expect.stringMatching(new RegExp(`^-rw-r--r-- .* ${longPath}$`)),
          expect.stringMatching(/^lrwxrwxrwx .* link -> hello$/),
          expect.stringMatching(
            new RegExp(`^lrwxrwxrwx .* far -> ${longTarget}$`),
          ),
        ])
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  )
})
