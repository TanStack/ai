import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { boundText, boundToolOutput } from '../src/first-party/bound-output'
import { mockAdapter, text, toolCall } from './helpers'
import type { AnyTool, ModelMessage } from '@tanstack/ai'
import type { AnyAgent, AnyHarness } from '../src'

const DAY = 24 * 60 * 60 * 1000
/** Five lines, 34 bytes. */
const FIVE_LINES = 'line 1\nline 2\nline 3\nline 4\nline 5'
/** FIVE_LINES cut to `maxLines: 3`. */
const FIRST_THREE =
  'line 1\nline 2\nline 3\n\n[Output cut. Showing the first 3 of 5 lines, 20 of 34 bytes.]'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'harness-bound-output-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** A tool named `lookup` that returns `output`. */
function lookup(output: unknown) {
  return toolDefinition({
    name: 'lookup',
    description: 'Look something up',
  }).server(async () => output)
}

/** A model that calls `tool` once, then answers. */
function callsOnce(tool: string) {
  return mockAdapter([() => toolCall(tool, {}), () => text('done')])
}

/** The tool message in the messages of one model call. */
function toolMessageIn(call: { messages: Array<ModelMessage> }) {
  return call.messages.find((message) => message.role === 'tool')
}

/** Open a session on `harness`, send one prompt, and close it. */
async function promptOnce(harness: AnyHarness) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(harness, { threadId: 't' })
  await session.prompt('go')
  await host.close()
}

/** The lead model calls `tool`. Gives back the tool message the model saw. */
async function leadToolMessage(
  tool: AnyTool,
  options: Parameters<typeof boundToolOutput>[0] = { maxLines: 3 },
) {
  const model = callsOnce(tool.name)
  await promptOnce(
    defineHarness({
      name: 'test/bound-output',
      adapter: model.adapter,
      tools: [tool],
      plugins: () => [boundToolOutput(options)],
    }),
  )
  return toolMessageIn(model.calls[1])
}

/** The lead model calls `lookup`, which returns `output`. Gives back the result the model saw. */
async function leadSees(
  output: unknown,
  options?: Parameters<typeof boundToolOutput>[0],
) {
  const message = await leadToolMessage(lookup(output), options)
  return message?.content
}

/** The lead model calls `agent` as a subagent. Gives back the result the model saw, parsed. */
async function leadSeesAgent(agent: AnyAgent) {
  const lead = callsOnce(agent.name)
  await promptOnce(
    defineHarness({
      name: 'test/bound-output',
      adapter: lead.adapter,
      subagents: { agents: [agent] },
      plugins: () => [boundToolOutput({ maxLines: 3 })],
    }),
  )
  return JSON.parse(String(toolMessageIn(lead.calls[1])?.content))
}

/** The paths of the outputs saved in `dir`. */
async function savedOutputs() {
  const names = await readdir(dir)
  return names
    .filter((name) => name.startsWith('tool-output-'))
    .map((name) => join(dir, name))
}

describe('boundText', () => {
  it.each([
    [
      'too many lines',
      'a\nb\nc\nd',
      { maxLines: 2, maxBytes: 100 },
      'a\nb\n\n[Output cut. Showing the first 2 of 4 lines, 3 of 7 bytes.]',
    ],
    [
      'too many bytes',
      'abcdef',
      { maxLines: 10, maxBytes: 4 },
      'abcd\n\n[Output cut. Showing the first 1 of 1 lines, 4 of 6 bytes.]',
    ],
    [
      'a two-byte character over the byte limit',
      'aéé',
      { maxLines: 10, maxBytes: 4 },
      'aé\n\n[Output cut. Showing the first 1 of 1 lines, 3 of 5 bytes.]',
    ],
    [
      'a surrogate pair over the byte limit',
      'x\u{1F600}',
      { maxLines: 10, maxBytes: 4 },
      'x\n\n[Output cut. Showing the first 1 of 1 lines, 1 of 5 bytes.]',
    ],
  ])('keeps the head of text with %s', (_case, input, limits, expected) => {
    expect(boundText(input, limits)).toEqual({ text: expected, truncated: true })
  })

  it.each([
    [
      'too many lines',
      'a\nb\nc\nd',
      { maxLines: 2, maxBytes: 100 },
      '[Output cut. Showing the last 2 of 4 lines, 3 of 7 bytes.]\n\nc\nd',
    ],
    [
      'too many lines and a final newline',
      'a\nb\nc\n',
      { maxLines: 2, maxBytes: 100 },
      '[Output cut. Showing the last 2 of 3 lines, 4 of 6 bytes.]\n\nb\nc\n',
    ],
    [
      'too many bytes',
      'abcdef',
      { maxLines: 10, maxBytes: 4 },
      '[Output cut. Showing the last 1 of 1 lines, 4 of 6 bytes.]\n\ncdef',
    ],
    [
      'a two-byte character over the byte limit',
      'ééa',
      { maxLines: 10, maxBytes: 4 },
      '[Output cut. Showing the last 1 of 1 lines, 3 of 5 bytes.]\n\néa',
    ],
    [
      'a surrogate pair over the byte limit',
      '\u{1F600}x',
      { maxLines: 10, maxBytes: 4 },
      '[Output cut. Showing the last 1 of 1 lines, 1 of 5 bytes.]\n\nx',
    ],
  ])('keeps the tail of text with %s', (_case, input, limits, expected) => {
    expect(boundText(input, { ...limits, keep: 'tail' })).toEqual({
      text: expected,
      truncated: true,
    })
  })

  it('leaves text inside both limits, and a final newline is not an extra line', () => {
    expect(boundText('a\nb\n', { maxLines: 2, maxBytes: 4 })).toEqual({
      text: 'a\nb\n',
      truncated: false,
    })
  })
})

describe('boundToolOutput', () => {
  it('cuts a long string result to its first lines, with a note', async () => {
    expect(await leadSees(FIVE_LINES)).toBe(FIRST_THREE)
  })

  it('cuts any other value as JSON text', async () => {
    const seen = await leadSees({ name: 'x'.repeat(200) }, { maxBytes: 20 })

    expect(seen).toBe(
      `{"name":"${'x'.repeat(11)}\n\n[Output cut. Showing the first 1 of 1 lines, 20 of 211 bytes.]`,
    )
  })

  it('leaves a short result alone and saves no file', async () => {
    const seen = await leadSees('line 1\nline 2', { maxLines: 3, dir })

    expect(seen).toBe('line 1\nline 2')
    expect(await savedOutputs()).toEqual([])
  })

  it('leaves content parts alone', async () => {
    const image = [
      {
        type: 'image',
        source: { type: 'data', value: 'A'.repeat(500), mimeType: 'image/png' },
      },
    ]

    expect(await leadSees(image, { maxBytes: 100 })).toEqual(image)
  })

  it('cuts the error text of a failed call, and it stays an error', async () => {
    const failing = toolDefinition({
      name: 'lookup',
      description: 'Look something up',
    }).server(async () => {
      throw new Error(FIVE_LINES)
    })

    const message = await leadToolMessage(failing)

    expect(message).toMatchObject({
      content: JSON.stringify({ error: FIRST_THREE }),
      error: FIRST_THREE,
    })
  })

  it('saves the full output in dir and gives its path in the note', async () => {
    const seen = await leadSees(FIVE_LINES, { maxLines: 3, dir })

    const [saved = ''] = await savedOutputs()
    expect(saved).toMatch(/tool-output-\d+-call-1\.txt$/)
    expect(seen).toBe(`${FIRST_THREE}\n[Full output saved to ${saved}.]`)
    expect(await readFile(saved, 'utf8')).toBe(FIVE_LINES)
  })

  it('removes saved outputs older than retentionDays and keeps other files', async () => {
    const old = `tool-output-${Date.now() - 8 * DAY}-old.txt`
    const recent = `tool-output-${Date.now() - DAY}-recent.txt`
    const names = [old, recent, 'notes.txt']
    await Promise.all(names.map((name) => writeFile(join(dir, name), 'x')))

    await leadSees(FIVE_LINES, { maxLines: 3, dir, retentionDays: 7 })

    const left = await readdir(dir)
    expect(left).not.toContain(old)
    expect(left).toEqual(expect.arrayContaining([recent, 'notes.txt']))
    expect(left).toHaveLength(3)
  })

  it('still cuts the result when the full output cannot be saved', async () => {
    const file = join(dir, 'a-file')
    await writeFile(file, 'x')

    const seen = await leadSees(FIVE_LINES, {
      maxLines: 3,
      dir: join(file, 'out'),
    })

    expect(seen).toEqual(
      expect.stringContaining(
        `${FIRST_THREE}\n[The full output was not saved: Error:`,
      ),
    )
  })

  it('cuts a tool result in a subagent run too', async () => {
    const researcherModel = callsOnce('lookup')
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks things up',
      run: (ctx) =>
        ctx.chat({
          adapter: researcherModel.adapter,
          tools: [lookup(FIVE_LINES)],
        }),
    })

    await leadSeesAgent(researcher)

    expect(toolMessageIn(researcherModel.calls[1])?.content).toBe(FIRST_THREE)
  })

  it('cuts a subagent answer and keeps its subagentRunId', async () => {
    const answers = mockAdapter([() => text(FIVE_LINES)])
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks things up',
      run: (ctx) => ctx.chat({ adapter: answers.adapter }),
    })

    expect(await leadSeesAgent(researcher)).toEqual({
      subagentRunId: expect.stringMatching(/.+/),
      result: FIRST_THREE,
    })
  })

  it('leaves a failed subagent call alone, so it keeps its subagentRunId', async () => {
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks things up',
      run: async () => {
        throw new Error(FIVE_LINES)
      },
    })

    expect(await leadSeesAgent(researcher)).toEqual({
      subagentRunId: expect.stringMatching(/.+/),
      error: FIVE_LINES,
    })
  })
})
