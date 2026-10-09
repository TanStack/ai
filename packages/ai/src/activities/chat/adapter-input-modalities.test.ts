import { describe, expect, it } from 'vitest'
import { BaseTextAdapter } from './adapter'
import type { AnyTextAdapter } from './adapter'
import type { DefaultMessageMetadataByModality, Modality } from '../../types'

// Stands in for a provider's model-meta map.
const INPUT_BY_MODEL: Record<string, ReadonlyArray<Modality>> = {
  'vision-model': ['text', 'image'],
}

/** A provider adapter that does not set `inputModalities`. */
class StubTextAdapter extends BaseTextAdapter<
  string,
  Record<string, never>,
  ReadonlyArray<Modality>,
  DefaultMessageMetadataByModality
> {
  readonly name = 'stub'

  constructor(model: string) {
    super({}, model)
  }

  async *chatStream() {}

  structuredOutput() {
    return Promise.resolve({ data: {}, rawText: '{}' })
  }
}

/** A provider adapter that sets `inputModalities` from its model name. */
class ModelMetaTextAdapter extends StubTextAdapter {
  override readonly inputModalities = INPUT_BY_MODEL[this.model]
}

describe('TextAdapter inputModalities', () => {
  it('exposes the list a subclass sets from its model name', () => {
    const adapter: AnyTextAdapter = new ModelMetaTextAdapter('vision-model')

    expect(adapter.inputModalities).toEqual(['text', 'image'])
  })

  it('is undefined when the subclass does not set it', () => {
    const adapter: AnyTextAdapter = new StubTextAdapter('vision-model')

    expect(adapter.inputModalities).toBeUndefined()
  })
})
