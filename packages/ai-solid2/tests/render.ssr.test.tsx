import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from '@solidjs/web'
import {
  ChatClient,
  GenerationClient,
  VideoGenerationClient,
} from '@tanstack/ai-client'
import { defineByok, memoryStorage } from '@tanstack/ai-client/byok'
import {
  useChat,
  useGeneration,
  useGenerateVideo,
  useByok,
  useAudioRecorder,
  usePageWebMCPTools,
  useRegisterWebMCPTools,
} from '../src/index'
import { TextPart } from '../src/ui'

const subscriptions = vi.hoisted(() => ({
  generation: vi.fn(),
  video: vi.fn(),
}))
vi.mock('@tanstack/ai-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/ai-client')>()
  return {
    ...actual,
    GenerationClient: class extends actual.GenerationClient<
      Record<string, unknown>,
      unknown
    > {
      constructor(
        options: ConstructorParameters<
          typeof actual.GenerationClient<Record<string, unknown>, unknown>
        >[0],
      ) {
        super(options)
        const subscribe = this.subscribe
        this.subscribe = (listener) => {
          subscriptions.generation()
          return subscribe(listener)
        }
      }
    },
    VideoGenerationClient: class extends actual.VideoGenerationClient<unknown> {
      constructor(
        options: ConstructorParameters<typeof actual.VideoGenerationClient>[0],
      ) {
        super(options)
        const subscribe = this.subscribe
        this.subscribe = (listener) => {
          subscriptions.video()
          return subscribe(listener)
        }
      }
    },
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('Solid 2 server rendering', () => {
  it('renders initial messages per request without attaching clients or browser subscriptions', () => {
    const attach = vi.spyOn(ChatClient.prototype, 'attach')
    const mount = vi.spyOn(GenerationClient.prototype, 'mountDevtools')
    const videoMount = vi.spyOn(
      VideoGenerationClient.prototype,
      'mountDevtools',
    )
    const client = defineByok({ storage: memoryStorage() })
    const subscribe = vi.spyOn(client, 'subscribe')
    const fetcher = vi.fn(async () => 'unused')
    function Page(props: { text: string }) {
      const chat = useChat({
        threadId: props.text,
        fetcher: async () => new Response(),
        initialMessages: [
          {
            id: 'seed',
            role: 'user',
            parts: [{ type: 'text', content: props.text }],
          },
        ],
      })
      const generation = useGeneration({ threadId: 'generation', fetcher })
      const video = useGenerateVideo({
        threadId: 'video',
        fetcher: async () => ({
          jobId: 'unused',
          status: 'completed',
          url: '/unused.mp4',
        }),
      })
      const byok = useByok(client)
      const recorder = useAudioRecorder()
      const tools = usePageWebMCPTools()
      useRegisterWebMCPTools([])
      return (
        <main>
          <TextPart
            content={
              chat
                .messages()[0]
                ?.parts.filter((part) => part.type === 'text')
                .map((part) => part.content)
                .join('') ?? ''
            }
          />
          <span>
            {generation.status()}:{video.status()}:
            {String(recorder.isRecording())}:{tools().length}:
            {String(Boolean(byok()))}
          </span>
        </main>
      )
    }
    const first = renderToString(() => <Page text="first request" />)
    const second = renderToString(() => <Page text="second request" />)
    expect(first).toContain('first request')
    expect(second).toContain('second request')
    expect(second).not.toContain('first request')
    expect(first).toContain('idle:idle:false:0:true')
    expect(attach).not.toHaveBeenCalled()
    expect(mount).not.toHaveBeenCalled()
    expect(videoMount).not.toHaveBeenCalled()
    expect(subscriptions.generation).not.toHaveBeenCalled()
    expect(subscriptions.video).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
