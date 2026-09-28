import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  promptDefinition,
  resourceDefinition,
} from '../../src/server/definitions'

describe('resourceDefinition', () => {
  it('returns the contents from the read function', async () => {
    const resource = resourceDefinition({
      uri: 'file:///readme.md',
      name: 'readme',
      mimeType: 'text/markdown',
    }).read(async () => ({ text: 'hello' }))

    expect(await resource.read()).toEqual({ text: 'hello' })
  })

  it('accepts a uriTemplate when uri is missing', async () => {
    const resource = resourceDefinition({
      name: 'file',
      mimeType: 'text/plain',
      uriTemplate: 'file:///{path}',
    }).read(async () => ({ text: 'body' }))

    expect(resource.uriTemplate).toBe('file:///{path}')
    expect(await resource.read()).toEqual({ text: 'body' })
  })

  it('throws when uri and uriTemplate are missing', () => {
    expect(() =>
      resourceDefinition({
        name: 'file',
        mimeType: 'text/plain',
      }),
    ).toThrow(
      'This resource has no uri and no uriTemplate. Pass a uri or a uriTemplate.',
    )
  })
})

describe('promptDefinition', () => {
  it('returns the message built from the parsed arguments', async () => {
    const prompt = promptDefinition({
      name: 'summarize',
      description: 'Summarize a topic',
      argsSchema: z.object({
        topic: z.string().transform((value) => value.toUpperCase()),
      }),
    }).render(async (args) => [{ role: 'user', content: args.topic }])

    expect(await prompt.render({ topic: 'x' })).toEqual([
      { role: 'user', content: 'X' },
    ])
  })
})
