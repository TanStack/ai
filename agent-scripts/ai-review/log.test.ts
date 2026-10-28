import { describe, expect, it } from 'vitest'
import { createReviewStreamLogger } from './log.ts'

function collect() {
  const lines: Array<string> = []
  const logger = createReviewStreamLogger((line) => {
    lines.push(line)
  })
  return { logger, lines }
}

describe('createReviewStreamLogger', () => {
  it('logs finished text and reasoning, not start/end noise', () => {
    const { logger, lines } = collect()
    logger.chunk({ type: 'RUN_STARTED' })
    logger.chunk({ type: 'TEXT_MESSAGE_START', messageId: 'm1' })
    logger.chunk({ type: 'TEXT_MESSAGE_CONTENT', delta: 'Hello ' })
    logger.chunk({ type: 'TEXT_MESSAGE_CONTENT', delta: 'world' })
    logger.chunk({ type: 'TEXT_MESSAGE_END', messageId: 'm1' })
    logger.chunk({
      type: 'REASONING_MESSAGE_CONTENT',
      delta: 'need to read files',
    })
    logger.chunk({ type: 'REASONING_MESSAGE_END' })
    logger.chunk({ type: 'RUN_FINISHED' })
    expect(lines).toEqual([
      'text:\nHello world',
      'reasoning:\nneed to read files',
    ])
  })

  it('logs tool name, input, and output', () => {
    const { logger, lines } = collect()
    logger.chunk({
      type: 'TOOL_CALL_START',
      toolCallId: 't1',
      toolCallName: 'read_file',
    })
    logger.chunk({
      type: 'TOOL_CALL_ARGS',
      toolCallId: 't1',
      delta: '{"path":"src/a.ts"}',
    })
    logger.chunk({
      type: 'TOOL_CALL_END',
      toolCallId: 't1',
      input: { path: 'src/a.ts' },
    })
    logger.chunk({
      type: 'TOOL_CALL_RESULT',
      toolCallId: 't1',
      content: '{"content":"export const x = 1"}',
    })
    expect(lines).toEqual([
      'tool read_file input:\n{\n  "path": "src/a.ts"\n}',
      'tool read_file output:\n{\n  "content": "export const x = 1"\n}',
    ])
  })

  it('skips empty text and unknown lifecycle events', () => {
    const { logger, lines } = collect()
    logger.chunk({ type: 'TEXT_MESSAGE_END' })
    logger.chunk({ type: 'STEP_STARTED', stepName: 'think' })
    logger.flush()
    expect(lines).toEqual([])
  })
})
