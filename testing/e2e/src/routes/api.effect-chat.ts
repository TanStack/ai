import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsResponse, toolDefinition } from '@tanstack/ai'
import * as AI from '@tanstack/ai-effect'
import { Context, Effect, Layer, Schema, Stream } from 'effect'
import { createTextAdapter } from '@/lib/providers'
import { createImageAdapter } from '@/lib/media-providers'

/**
 * `@tanstack/ai-effect` over a real adapter wire (aimock).
 *
 * - Default: `AI.chat` with an Effect tool. The tool reads a `Weather`
 *   service that a `Layer` provides. The run streams back as SSE.
 * - `?kind=image`: `AI.generateImage` runs as an Effect and returns JSON.
 * - `?kind=stop`: `Stream.take` stops the chat after its first text chunk,
 *   and the JSON counts the middleware `onAbort` calls.
 */
class Weather extends Context.Service<
  Weather,
  { readonly forecast: (city: string) => Effect.Effect<string> }
>()('Weather') {}

const WeatherLive = Layer.succeed(Weather, {
  forecast: (city) => Effect.succeed(`Sunny and 21C in ${city}`),
})

const getWeatherDef = toolDefinition({
  name: 'get_weather',
  description: 'Get the weather for a city',
  inputSchema: AI.toolSchema(Schema.Struct({ city: Schema.String })),
  outputSchema: AI.toolSchema(Schema.Struct({ forecast: Schema.String })),
})

const getWeather = AI.serverTool(getWeatherDef, ({ city }) =>
  Effect.gen(function* () {
    const weather = yield* Weather
    return { forecast: yield* weather.forecast(city) }
  }),
)

export const Route = createFileRoute('/api/effect-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId') ?? undefined
        const port = url.searchParams.get('aimockPort')
        const aimockPort = port ? Number(port) : undefined

        if (url.searchParams.get('kind') === 'image') {
          const result = await Effect.runPromise(
            AI.generateImage({
              adapter: createImageAdapter('openai', aimockPort, testId),
              threadId: 'effect-image',
              prompt: '[effect-image] a red fox',
            }),
          )
          return Response.json(result)
        }

        if (url.searchParams.get('kind') === 'stop') {
          let aborts = 0
          await Effect.runPromise(
            Stream.runDrain(
              AI.chat({
                ...createTextAdapter('openai', undefined, aimockPort, testId),
                threadId: 'effect-stop',
                messages: [
                  {
                    role: 'user',
                    content: '[abort-test] tell me a long story',
                  },
                ],
                middleware: [
                  {
                    name: 'count-aborts',
                    onAbort: () => {
                      aborts++
                    },
                  },
                ],
              }).pipe(
                Stream.filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT'),
                Stream.take(1),
              ),
            ),
          )
          return Response.json({ aborts })
        }

        const chunks = AI.chat({
          ...createTextAdapter('openai', undefined, aimockPort, testId),
          threadId: 'effect-chat',
          messages: [
            { role: 'user', content: '[effect-chat] weather in Oslo' },
          ],
          tools: [getWeather],
        }).pipe(Stream.provide(WeatherLive))

        return toServerSentEventsResponse(Stream.toAsyncIterable(chunks))
      },
    },
  },
})
