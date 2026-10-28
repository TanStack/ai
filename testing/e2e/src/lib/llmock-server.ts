let mockInstance: any = null
let startPromise: Promise<any> | null = null

export async function ensureLLMock() {
  if (!process.env.LLMOCK_RECORD) {
    return null
  }

  if (mockInstance) return mockInstance
  if (startPromise) return startPromise

  startPromise = (async () => {
    const { LLMock } = await import('@copilotkit/aimock')

    // aimock 1.17+ moved the record options under `record: RecordConfig`.
    // Provider keys must come from RecordProviderKey — `elevenlabs` is in that
    // union so we can proxy api.elevenlabs.io for music + SFX recording when
    // ELEVENLABS_API_KEY is set.
    mockInstance = new LLMock({
      port: 4010,
      host: '127.0.0.1',
      logLevel: 'info',
      record: {
        providers: {
          openai: process.env.OPENAI_API_KEY,
          anthropic: process.env.ANTHROPIC_API_KEY,
          gemini: process.env.GOOGLE_API_KEY,
          ollama: 'http://localhost:11434',
          elevenlabs: process.env.ELEVENLABS_API_KEY,
        },
        fixturePath: './fixtures/recorded',
      },
    })

    await mockInstance.start()
    console.log(`[llmock] Record mode started at http://127.0.0.1:4010`)
    return mockInstance
  })()

  return startPromise
}
