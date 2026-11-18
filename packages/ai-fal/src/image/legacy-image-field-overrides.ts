import type {
  FalImageFieldName,
  FalImageFieldOverride,
} from './generated/image-field-overrides'

/**
 * Hand-kept field overrides for fal endpoints that are still live but have no
 * types in `@fal-ai/client`, so the generator cannot find them. The generated
 * `FAL_IMAGE_FIELD_OVERRIDES` wins when it has the same endpoint.
 *
 * Before you add or remove an entry, check that the endpoint is live:
 * `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>` returns
 * 200 for a live endpoint and 404 for a removed one.
 */
export const FAL_LEGACY_IMAGE_FIELD_OVERRIDES: Record<
  string,
  { [Role in keyof FalImageFieldOverride]?: FalImageFieldName }
> = {
  'decart/lucy-i2v': { start: 'image_url' },
  'fal-ai/bytedance/seedance/v1/lite/image-to-video': { start: 'image_url' },
  'fal-ai/bytedance/seedance/v1/lite/reference-to-video': {
    multi: 'reference_image_urls',
  },
  'fal-ai/bytedance/seedream/v5/lite/edit': {
    single: 'image_urls',
    reference: 'image_urls',
  },
  'fal-ai/infinitalk': { start: 'image_url' },
  'fal-ai/infinitalk/single-text': { start: 'image_url' },
  'fal-ai/kling-video/v1.5/pro/image-to-video': {
    start: 'image_url',
    end: 'tail_image_url',
  },
  'fal-ai/kling-video/v1.6/pro/image-to-video': {
    start: 'image_url',
    end: 'tail_image_url',
  },
  'fal-ai/kling-video/v1.6/standard/image-to-video': { start: 'image_url' },
  'fal-ai/kling-video/v1/standard/image-to-video': {
    start: 'image_url',
    end: 'tail_image_url',
  },
  'fal-ai/kling-video/v2.1/master/image-to-video': { start: 'image_url' },
  'fal-ai/kling-video/v2.1/standard/image-to-video': { start: 'image_url' },
  'fal-ai/kling-video/v2/master/image-to-video': { start: 'image_url' },
  'fal-ai/ltx-2-19b/audio-to-video': { start: 'image_url' },
  'fal-ai/ltx-2-19b/audio-to-video/lora': { start: 'image_url' },
  'fal-ai/ltx-2-19b/distilled/audio-to-video': { start: 'image_url' },
  'fal-ai/ltx-2-19b/distilled/audio-to-video/lora': { start: 'image_url' },
  'fal-ai/ltx-2-19b/distilled/image-to-video': { start: 'image_url' },
  'fal-ai/ltx-2-19b/distilled/video-to-video': { start: 'image_url' },
  'fal-ai/ltx-2-19b/distilled/video-to-video/lora': { start: 'image_url' },
  'fal-ai/ltx-2-19b/image-to-video': { start: 'image_url' },
  'fal-ai/ltx-2-19b/image-to-video/lora': { start: 'image_url' },
  'fal-ai/ltx-2-19b/video-to-video': { start: 'image_url' },
  'fal-ai/ltx-2-19b/video-to-video/lora': { start: 'image_url' },
  'fal-ai/pika/v1.5/pikaffects': { start: 'image_url' },
  'fal-ai/pika/v2.1/image-to-video': { start: 'image_url' },
  'fal-ai/pika/v2/pikadditions': { start: 'image_url' },
  'fal-ai/pika/v2/turbo/image-to-video': { start: 'image_url' },
  'fal-ai/qwen-image-2/edit': { single: 'image_urls', reference: 'image_urls' },
  'fal-ai/qwen-image-2/pro/edit': {
    single: 'image_urls',
    reference: 'image_urls',
  },
  'fal-ai/veo3.1/fast/first-last-frame-to-video': {
    start: 'first_frame_url',
    end: 'last_frame_url',
  },
  'fal-ai/veo3.1/fast/image-to-video': { start: 'image_url' },
  'fal-ai/veo3.1/first-last-frame-to-video': {
    start: 'first_frame_url',
    end: 'last_frame_url',
  },
  'fal-ai/veo3.1/image-to-video': { start: 'image_url' },
  'fal-ai/veo3.1/lite/first-last-frame-to-video': {
    start: 'first_frame_url',
    end: 'last_frame_url',
  },
  'fal-ai/veo3.1/lite/image-to-video': { start: 'image_url' },
  'fal-ai/veo3.1/reference-to-video': {
    single: 'image_urls',
    reference: 'image_urls',
  },
  'fal-ai/veo3/fast/image-to-video': { start: 'image_url' },
  'fal-ai/veo3/image-to-video': { start: 'image_url' },
  'fal-ai/wan-22-vace-fun-a14b/pose': {
    multi: 'ref_image_urls',
    reference: 'ref_image_urls',
    start: 'first_frame_url',
    end: 'last_frame_url',
  },
  'fal-ai/wan-motion': { start: 'image_url' },
}
