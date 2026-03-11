import { describe, expect, it, vi } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { contentGuardMiddleware } from '../src/middlewares/content-guard'
import type { StreamChunk } from '../src/types'
import {
  ev,
  createMockAdapter,
  collectChunks,
  getDeltas,
} from './test-utils'

describe('contentGuardMiddleware', () => {
  describe('delta strategy', () => {
    it('should replace regex pattern in delta', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('My SSN is 123-45-6789'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [
              { pattern: /\d{3}-\d{2}-\d{4}/g, replacement: '[REDACTED]' },
            ],
            strategy: 'delta',
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      expect(deltas.join('')).toBe('My SSN is [REDACTED]')
    })

    it('should apply custom function rule', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('hello world'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [{ fn: (text) => text.toUpperCase() }],
            strategy: 'delta',
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      expect(deltas.join('')).toBe('HELLO WORLD')
    })

    it('should compose multiple rules in order', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('foo bar baz'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [
              { pattern: /foo/g, replacement: 'AAA' },
              { fn: (text) => text.toLowerCase() },
            ],
            strategy: 'delta',
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      expect(deltas.join('')).toBe('aaa bar baz')
    })

    it('should drop chunk when blockOnMatch is true and content changed', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('safe content'),
            ev.textContent('bad word here'),
            ev.textContent('more safe content'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [{ pattern: /bad/g, replacement: '***' }],
            strategy: 'delta',
            blockOnMatch: true,
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      expect(deltas).toEqual(['safe content', 'more safe content'])
    })

    it('should pass through non-text chunks unchanged', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('hello'),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [{ fn: (text) => text.toUpperCase() }],
            strategy: 'delta',
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const toolChunks = chunks.filter((c) => c.type === 'TOOL_CALL_START')
      expect(toolChunks).toHaveLength(1)
    })

    it('should call onFiltered callback when content is modified', async () => {
      const onFiltered = vi.fn()
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('replace me'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [{ pattern: /me/g, replacement: 'you' }],
            strategy: 'delta',
            onFiltered,
          }),
        ],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)
      expect(onFiltered).toHaveBeenCalledTimes(1)
      expect(onFiltered).toHaveBeenCalledWith(
        expect.objectContaining({
          original: 'replace me',
          filtered: 'replace you',
          strategy: 'delta',
        }),
      )
    })

    it('should not call onFiltered when content is unchanged', async () => {
      const onFiltered = vi.fn()
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('safe text'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [{ pattern: /badword/g, replacement: '***' }],
            strategy: 'delta',
            onFiltered,
          }),
        ],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)
      expect(onFiltered).not.toHaveBeenCalled()
    })
  })

  describe('buffered strategy', () => {
    it('should catch patterns spanning chunk boundaries', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('My SSN is 123', 'msg-1'),
            ev.textContent('-45-6789 thanks', 'msg-1'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [
              { pattern: /\d{3}-\d{2}-\d{4}/g, replacement: '[REDACTED]' },
            ],
            strategy: 'buffered',
            bufferSize: 20,
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      const text = deltas.join('')
      expect(text).toBe('My SSN is [REDACTED] thanks')
      expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/)
    })

    it('should flush remaining buffer on stream end', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('hello world', 'msg-1'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [{ pattern: /world/g, replacement: 'earth' }],
            strategy: 'buffered',
            bufferSize: 50,
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      expect(deltas.join('')).toBe('hello earth')
    })

    it('should respect custom bufferSize', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('This is a test hello', 'msg-1'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [{ pattern: /hello/g, replacement: 'WORLD' }],
            strategy: 'buffered',
            bufferSize: 5,
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      expect(deltas.join('')).toBe('This is a test WORLD')
    })

    it('should handle short content smaller than bufferSize', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('hi', 'msg-1'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [{ pattern: /hi/g, replacement: 'bye' }],
            strategy: 'buffered',
            bufferSize: 50,
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      expect(deltas.join('')).toBe('bye')
    })

    it('should drop chunks with blockOnMatch in buffered mode', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('this has a badword in it', 'msg-1'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [{ pattern: /badword/g, replacement: '***' }],
            strategy: 'buffered',
            bufferSize: 50,
            blockOnMatch: true,
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      expect(deltas.join('')).toBe('')
    })

    it('should call onFiltered for buffered strategy', async () => {
      const onFiltered = vi.fn()
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('secret 123-45-6789', 'msg-1'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [
              { pattern: /\d{3}-\d{2}-\d{4}/g, replacement: '[REDACTED]' },
            ],
            strategy: 'buffered',
            bufferSize: 50,
            onFiltered,
          }),
        ],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)
      expect(onFiltered).toHaveBeenCalled()
      const call = onFiltered.mock.calls[0]![0]
      expect(call.strategy).toBe('buffered')
      expect(call.filtered).toContain('[REDACTED]')
    })

    it('should pass through non-text chunks in buffered mode', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('hello', 'msg-1'),
            ev.toolStart('tc-1', 'myTool'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          contentGuardMiddleware({
            rules: [{ fn: (t) => t.toUpperCase() }],
            strategy: 'buffered',
            bufferSize: 50,
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const toolChunks = chunks.filter((c) => c.type === 'TOOL_CALL_START')
      expect(toolChunks).toHaveLength(1)
    })
  })
})
