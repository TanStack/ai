import { toolDefinition } from '@tanstack/ai'
import * as AI from '@tanstack/ai-effect'
import { Context, Effect, Layer, Schema } from 'effect'

export class Weather extends Context.Service<
  Weather,
  { readonly forecast: (city: string) => Effect.Effect<string> }
>()('Weather') {}

// A fixed forecast. Call a real weather API here.
export const WeatherLive = Layer.succeed(Weather, {
  forecast: (city) => Effect.succeed(`Sunny and 22 C in ${city}`),
})

const getWeatherDef = toolDefinition({
  name: 'get_weather',
  description: 'Get the weather forecast for a city',
  inputSchema: AI.toolSchema(Schema.Struct({ city: Schema.String })),
  outputSchema: AI.toolSchema(Schema.Struct({ forecast: Schema.String })),
})

export const getWeather = AI.serverTool(getWeatherDef, ({ city }) =>
  Effect.gen(function* () {
    const weather = yield* Weather
    return { forecast: yield* weather.forecast(city) }
  }),
)
