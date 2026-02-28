/**
 * Type Safety Tests for generateImage() function
 *
 * These tests verify that the generateImage() function correctly constrains types based on:
 * 1. Model-specific provider options (modelOptions) - e.g., quality, style, background
 * 2. Model-specific sizes - e.g., dall-e-3 has different sizes than dall-e-2
 *
 * Uses @ts-expect-error to ensure TypeScript catches invalid type combinations.
 */
import { describe, expectTypeOf, it } from 'vitest'
import { BaseImageAdapter } from '../src/activities/generateImage/adapter'
import { generateImage } from '../src/activities/generateImage'
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../src/types'

// ===========================
// Mock Provider Options Types
// ===========================

/**
 * Base options available to ALL mock image models
 */
interface MockImageBaseProviderOptions {
  /**
   * A unique identifier representing your end-user.
   */
  user?: string
}

/**
 * Quality options for mock-gpt-image-1 model
 */
type MockGptImageQuality = 'high' | 'medium' | 'low' | 'auto'

/**
 * Quality options for mock-dall-e-3 model
 */
type MockDallE3Quality = 'hd' | 'standard'

/**
 * Style options for mock-dall-e-3 model
 */
type MockDallE3Style = 'vivid' | 'natural'

/**
 * Output format options for mock-gpt-image-1 models
 */
type MockGptImageOutputFormat = 'png' | 'jpeg' | 'webp'

/**
 * Response format options for mock-dall-e models
 */
type MockDallEResponseFormat = 'url' | 'b64_json'

/**
 * Background options for mock-gpt-image-1 models
 */
type MockGptImageBackground = 'transparent' | 'opaque' | 'auto'

/**
 * Moderation level for mock-gpt-image-1 models
 */
type MockGptImageModeration = 'low' | 'auto'

// ===========================
// Mock Size Types
// ===========================

/**
 * Supported sizes for mock-gpt-image-1 model
 */
type MockGptImageSize = '1024x1024' | '1536x1024' | '1024x1536' | 'auto'

/**
 * Supported sizes for mock-dall-e-3 model
 */
type MockDallE3Size = '1024x1024' | '1792x1024' | '1024x1792'

// ===========================
// Mock Model Provider Options
// ===========================

/**
 * Provider options for mock-gpt-image-1 model
 * Full featured model with many options
 */
interface MockGptImage1ProviderOptions extends MockImageBaseProviderOptions {
  /**
   * The quality of the image.
   * @default 'auto'
   */
  quality?: MockGptImageQuality

  /**
   * Background transparency setting.
   * @default 'auto'
   */
  background?: MockGptImageBackground

  /**
   * Output image format.
   * @default 'png'
   */
  output_format?: MockGptImageOutputFormat

  /**
   * Compression level (0-100%) for webp/jpeg formats.
   * @default 100
   */
  output_compression?: number

  /**
   * Content moderation level.
   * @default 'auto'
   */
  moderation?: MockGptImageModeration
}

/**
 * Provider options for mock-dall-e-3 model
 * Limited options with style support
 */
interface MockDallE3ProviderOptions extends MockImageBaseProviderOptions {
  /**
   * The quality of the image.
   * @default 'standard'
   */
  quality?: MockDallE3Quality

  /**
   * The style of the generated images.
   * @default 'vivid'
   */
  style?: MockDallE3Style

  /**
   * The format in which generated images are returned.
   * @default 'url'
   */
  response_format?: MockDallEResponseFormat
}

/**
 * Union of all mock image provider options
 */
type MockImageProviderOptions =
  | MockGptImage1ProviderOptions
  | MockDallE3ProviderOptions

// ===========================
// Mock Type Maps
// ===========================

/**
 * Type map: model name -> provider options
 */
type MockImageModelProviderOptionsByName = {
  'mock-gpt-image-1': MockGptImage1ProviderOptions
  'mock-dall-e-3': MockDallE3ProviderOptions
}

/**
 * Type map: model name -> supported sizes
 */
type MockImageModelSizeByName = {
  'mock-gpt-image-1': MockGptImageSize
  'mock-dall-e-3': MockDallE3Size
}

// ===========================
// Mock Model Definitions
// ===========================

const MOCK_GPT_IMAGE_1 = {
  name: 'mock-gpt-image-1',
} as const

const MOCK_DALL_E_3 = {
  name: 'mock-dall-e-3',
} as const

/**
 * List of available mock image models
 */
const MOCK_IMAGE_MODELS = [MOCK_GPT_IMAGE_1.name, MOCK_DALL_E_3.name] as const

type MockImageModel = (typeof MOCK_IMAGE_MODELS)[number]

// ===========================
// Mock Adapter Implementation
// ===========================

/**
 * Mock Image Adapter - simulates OpenAI image adapter structure
 */
class MockImageAdapter<TModel extends MockImageModel> extends BaseImageAdapter<
  TModel,
  MockImageProviderOptions,
  MockImageModelProviderOptionsByName,
  MockImageModelSizeByName
> {
  readonly kind = 'image' as const
  readonly name = 'mock' as const

  constructor(model: TModel) {
    super({}, model)
  }

  /* eslint-disable @typescript-eslint/require-await */
  generateImages = async (
    _options: ImageGenerationOptions<
      MockImageProviderOptions,
      MockImageModelSizeByName[TModel]
    >,
  ): Promise<ImageGenerationResult> => {
    return {
      id: 'mock-id',
      model: this.model,
      images: [
        {
          url: 'https://example.com/image.png',
        },
      ],
    }
  }
  /* eslint-enable @typescript-eslint/require-await */
}

/**
 * Factory function to create mock image adapters with proper type inference
 */
function mockImage<TModel extends MockImageModel>(
  model: TModel,
): MockImageAdapter<TModel> {
  return new MockImageAdapter(model)
}

// ===========================
// Type Safety Tests
// ===========================

describe('Type Safety Tests for generateImage() function', () => {
  describe('Model-specific Sizes Type Safety', () => {
    describe('mock-gpt-image-1 sizes', () => {
      it('should allow valid gpt-image-1 sizes', () => {
        // These should all compile - valid sizes for mock-gpt-image-1
        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          size: '1024x1024',
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          size: '1536x1024',
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          size: '1024x1536',
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          size: 'auto',
        })
      })

      it('should NOT allow dall-e-3 specific sizes on gpt-image-1', () => {
        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          // @ts-expect-error - '1792x1024' is not a valid size for mock-gpt-image-1
          size: '1792x1024',
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          // @ts-expect-error - '1024x1792' is not a valid size for mock-gpt-image-1
          size: '1024x1792',
        })
      })

      it('should NOT allow arbitrary sizes', () => {
        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          // @ts-expect-error - '512x512' is not a valid size for mock-gpt-image-1
          size: '512x512',
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          // @ts-expect-error - '256x256' is not a valid size for mock-gpt-image-1
          size: '256x256',
        })
      })
    })

    describe('mock-dall-e-3 sizes', () => {
      it('should allow valid dall-e-3 sizes', () => {
        // These should all compile - valid sizes for mock-dall-e-3
        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          size: '1024x1024',
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          size: '1792x1024',
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          size: '1024x1792',
        })
      })

      it('should NOT allow gpt-image-1 specific sizes on dall-e-3', () => {
        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          // @ts-expect-error - '1536x1024' is not a valid size for mock-dall-e-3
          size: '1536x1024',
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          // @ts-expect-error - '1024x1536' is not a valid size for mock-dall-e-3
          size: '1024x1536',
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          // @ts-expect-error - 'auto' is not a valid size for mock-dall-e-3
          size: 'auto',
        })
      })

      it('should NOT allow arbitrary sizes', () => {
        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          // @ts-expect-error - '512x512' is not a valid size for mock-dall-e-3
          size: '512x512',
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          // @ts-expect-error - '256x256' is not a valid size for mock-dall-e-3
          size: '2x2',
        })
      })
    })
  })

  describe('Model-specific Provider Options (modelOptions) Type Safety', () => {
    describe('mock-gpt-image-1 provider options', () => {
      it('should allow all gpt-image-1 specific options', () => {
        // This should compile - all valid options for mock-gpt-image-1
        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: {
            quality: 'high',
            background: 'transparent',
            output_format: 'png',
            output_compression: 80,
            moderation: 'auto',
            user: 'user-123',
          },
        })
      })

      it('should allow valid quality values for gpt-image-1', () => {
        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: { quality: 'high' },
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: { quality: 'medium' },
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: { quality: 'low' },
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: { quality: 'auto' },
        })
      })

      it('should allow valid background values for gpt-image-1', () => {
        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: { background: 'transparent' },
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: { background: 'opaque' },
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: { background: 'auto' },
        })
      })

      it('should allow valid output_format values for gpt-image-1', () => {
        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: { output_format: 'png' },
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: { output_format: 'jpeg' },
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: { output_format: 'webp' },
        })
      })

      it('should NOT allow dall-e-3 quality values on gpt-image-1', () => {
        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'hd' is a dall-e-3 quality value, not valid for gpt-image-1
            quality: 'hd',
          },
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'standard' is a dall-e-3 quality value, not valid for gpt-image-1
            quality: 'standard',
          },
        })
      })

      it('should NOT allow dall-e-3 specific options on gpt-image-1', () => {
        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'style' is not available on mock-gpt-image-1
            style: 'vivid',
          },
        })

        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'response_format' is not available on mock-gpt-image-1
            response_format: 'url',
          },
        })
      })

      it('should NOT allow unknown options on gpt-image-1', () => {
        generateImage({
          adapter: mockImage('mock-gpt-image-1'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'unknownOption' does not exist
            unknownOption: true,
          },
        })
      })
    })

    describe('mock-dall-e-3 provider options', () => {
      it('should allow all dall-e-3 specific options', () => {
        // This should compile - all valid options for mock-dall-e-3
        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: {
            quality: 'hd',
            style: 'vivid',
            response_format: 'url',
            user: 'user-123',
          },
        })
      })

      it('should allow valid quality values for dall-e-3', () => {
        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: { quality: 'hd' },
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: { quality: 'standard' },
        })
      })

      it('should allow valid style values for dall-e-3', () => {
        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: { style: 'vivid' },
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: { style: 'natural' },
        })
      })

      it('should allow valid response_format values for dall-e-3', () => {
        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: { response_format: 'url' },
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: { response_format: 'b64_json' },
        })
      })

      it('should NOT allow gpt-image-1 quality values on dall-e-3', () => {
        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'high' is a gpt-image-1 quality value, not valid for dall-e-3
            quality: 'high',
          },
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'medium' is a gpt-image-1 quality value, not valid for dall-e-3
            quality: 'medium',
          },
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'low' is a gpt-image-1 quality value, not valid for dall-e-3
            quality: 'low',
          },
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'auto' is a gpt-image-1 quality value, not valid for dall-e-3
            quality: 'auto',
          },
        })
      })

      it('should NOT allow gpt-image-1 specific options on dall-e-3', () => {
        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'background' is not available on mock-dall-e-3
            background: 'transparent',
          },
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'output_format' is not available on mock-dall-e-3
            output_format: 'png',
          },
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'output_compression' is not available on mock-dall-e-3
            output_compression: 80,
          },
        })

        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'moderation' is not available on mock-dall-e-3
            moderation: 'auto',
          },
        })
      })

      it('should NOT allow invalid style values on dall-e-3', () => {
        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'abstract' is not a valid style value
            style: 'abstract',
          },
        })
      })

      it('should NOT allow unknown options on dall-e-3', () => {
        generateImage({
          adapter: mockImage('mock-dall-e-3'),
          prompt: 'A cute cat',
          modelOptions: {
            // @ts-expect-error - 'unknownOption' does not exist
            unknownOption: true,
          },
        })
      })
    })
  })

  describe('Model Name Type Safety', () => {
    it('should accept valid model names', () => {
      const _adapter1 = mockImage('mock-gpt-image-1')
      const _adapter2 = mockImage('mock-dall-e-3')
      expectTypeOf(_adapter1).toBeObject()
      expectTypeOf(_adapter2).toBeObject()
    })

    it('should NOT accept invalid model names', () => {
      // @ts-expect-error - 'invalid-model' is not a valid mock image model name
      const _adapter = mockImage('invalid-model')
    })
  })

  describe('Combined Scenarios', () => {
    it('mock-gpt-image-1: full featured call should work', () => {
      // This should compile - using all features available to mock-gpt-image-1
      generateImage({
        adapter: mockImage('mock-gpt-image-1'),
        prompt: 'A professional product photo of a watch',
        size: '1536x1024',
        numberOfImages: 2,
        modelOptions: {
          quality: 'high',
          background: 'transparent',
          output_format: 'webp',
          output_compression: 90,
          moderation: 'auto',
          user: 'user-123',
        },
      })
    })

    it('mock-dall-e-3: full featured call should work', () => {
      // This should compile - using all features available to mock-dall-e-3
      generateImage({
        adapter: mockImage('mock-dall-e-3'),
        prompt: 'A beautiful sunset over mountains',
        size: '1792x1024',
        numberOfImages: 1,
        modelOptions: {
          quality: 'hd',
          style: 'vivid',
          response_format: 'url',
          user: 'user-456',
        },
      })
    })

    it('mock-dall-e-3: should error with gpt-image-1 options and sizes', () => {
      generateImage({
        adapter: mockImage('mock-dall-e-3'),
        prompt: 'A cute cat',
        // @ts-expect-error - '1536x1024' is not a valid size for mock-dall-e-3
        size: '1536x1024',
        modelOptions: {
          // @ts-expect-error - 'background' is not available on mock-dall-e-3
          background: 'transparent',
        },
      })
    })

    it('mock-gpt-image-1: should error with dall-e-3 options and sizes', () => {
      generateImage({
        adapter: mockImage('mock-gpt-image-1'),
        prompt: 'A cute cat',
        // @ts-expect-error - '1792x1024' is not a valid size for mock-gpt-image-1
        size: '1792x1024',
        modelOptions: {
          // @ts-expect-error - 'style' is not available on mock-gpt-image-1
          style: 'vivid',
        },
      })
    })
  })

  describe('Base Options Shared Across Models', () => {
    it('should allow user option on both models', () => {
      generateImage({
        adapter: mockImage('mock-gpt-image-1'),
        prompt: 'A cute cat',
        modelOptions: { user: 'user-123' },
      })

      generateImage({
        adapter: mockImage('mock-dall-e-3'),
        prompt: 'A cute cat',
        modelOptions: { user: 'user-456' },
      })
    })
  })
})

describe('Provider Options Type Assertions', () => {
  describe('mock-gpt-image-1 should have full featured options', () => {
    it('should have quality option', () => {
      type Options = MockImageModelProviderOptionsByName['mock-gpt-image-1']
      expectTypeOf<Options>().toHaveProperty('quality')
    })

    it('should have background option', () => {
      type Options = MockImageModelProviderOptionsByName['mock-gpt-image-1']
      expectTypeOf<Options>().toHaveProperty('background')
    })

    it('should have output_format option', () => {
      type Options = MockImageModelProviderOptionsByName['mock-gpt-image-1']
      expectTypeOf<Options>().toHaveProperty('output_format')
    })

    it('should have output_compression option', () => {
      type Options = MockImageModelProviderOptionsByName['mock-gpt-image-1']
      expectTypeOf<Options>().toHaveProperty('output_compression')
    })

    it('should have moderation option', () => {
      type Options = MockImageModelProviderOptionsByName['mock-gpt-image-1']
      expectTypeOf<Options>().toHaveProperty('moderation')
    })

    it('should NOT have style option (dall-e-3 only)', () => {
      type Options = MockImageModelProviderOptionsByName['mock-gpt-image-1']
      expectTypeOf<Options>().not.toHaveProperty('style')
    })

    it('should NOT have response_format option (dall-e-3 only)', () => {
      type Options = MockImageModelProviderOptionsByName['mock-gpt-image-1']
      expectTypeOf<Options>().not.toHaveProperty('response_format')
    })
  })

  describe('mock-dall-e-3 should have limited options with style', () => {
    it('should have quality option', () => {
      type Options = MockImageModelProviderOptionsByName['mock-dall-e-3']
      expectTypeOf<Options>().toHaveProperty('quality')
    })

    it('should have style option', () => {
      type Options = MockImageModelProviderOptionsByName['mock-dall-e-3']
      expectTypeOf<Options>().toHaveProperty('style')
    })

    it('should have response_format option', () => {
      type Options = MockImageModelProviderOptionsByName['mock-dall-e-3']
      expectTypeOf<Options>().toHaveProperty('response_format')
    })

    it('should NOT have background option (gpt-image-1 only)', () => {
      type Options = MockImageModelProviderOptionsByName['mock-dall-e-3']
      expectTypeOf<Options>().not.toHaveProperty('background')
    })

    it('should NOT have output_format option (gpt-image-1 only)', () => {
      type Options = MockImageModelProviderOptionsByName['mock-dall-e-3']
      expectTypeOf<Options>().not.toHaveProperty('output_format')
    })

    it('should NOT have output_compression option (gpt-image-1 only)', () => {
      type Options = MockImageModelProviderOptionsByName['mock-dall-e-3']
      expectTypeOf<Options>().not.toHaveProperty('output_compression')
    })

    it('should NOT have moderation option (gpt-image-1 only)', () => {
      type Options = MockImageModelProviderOptionsByName['mock-dall-e-3']
      expectTypeOf<Options>().not.toHaveProperty('moderation')
    })
  })
})

describe('Model Size Type Assertions', () => {
  describe('mock-gpt-image-1 sizes', () => {
    type Sizes = MockImageModelSizeByName['mock-gpt-image-1']

    it('should have correct size type', () => {
      expectTypeOf<Sizes>().toEqualTypeOf<
        '1024x1024' | '1536x1024' | '1024x1536' | 'auto'
      >()
    })
  })

  describe('mock-dall-e-3 sizes', () => {
    type Sizes = MockImageModelSizeByName['mock-dall-e-3']

    it('should have correct size type', () => {
      expectTypeOf<Sizes>().toEqualTypeOf<
        '1024x1024' | '1792x1024' | '1024x1792'
      >()
    })
  })
})
