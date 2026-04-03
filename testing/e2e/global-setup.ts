import { LLMock } from '@copilotkit/llmock'

export default async function globalSetup() {
  const mock = new LLMock({ port: 4010, host: '127.0.0.1', logLevel: 'info' })
  await mock.loadFixtureDir('./fixtures')
  await mock.start()
  console.log(`[global-setup] llmock started at ${mock.url}`)
  ;(globalThis as any).__llmock = mock
}
