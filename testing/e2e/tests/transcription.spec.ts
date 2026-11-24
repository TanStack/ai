import { test, expect } from './fixtures'
import { clickGenerate, waitForGenerationComplete, featureUrl } from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('transcription')) {
  test.describe(`${provider} -- transcription`, () => {
    test('sse -- transcribes audio via SSE connection', async ({
      page,
      request,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'transcription', testId, aimockPort, 'sse'),
      )
      await clickGenerate(page)
      if (provider === 'openai') {
        let assertionsPassed = false
        try {
          await expect(page.getByTestId('transcription-partial')).toHaveText(
            'I would like to buy a Fender Stratocaster please',
          )
          await expect(page.getByTestId('generation-status')).toHaveText(
            'loading',
          )
          assertionsPassed = true
        } finally {
          const response = await request
            .post(
              `http://127.0.0.1:${aimockPort}/transcription-stream/release`,
              { headers: { 'x-test-id': testId } },
            )
            .catch((error: unknown) => {
              if (assertionsPassed) throw error
              return undefined
            })
          if (assertionsPassed) expect(response?.status()).toBe(204)
        }
      }
      await waitForGenerationComplete(page)
      const text = await page.getByTestId('transcription-text').innerText()
      expect(text).toContain('Fender Stratocaster')
    })

    test('http-stream -- transcribes audio via HTTP stream', async ({
      page,
      request,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(
          provider,
          'transcription',
          testId,
          aimockPort,
          'http-stream',
        ),
      )
      await clickGenerate(page)
      if (provider === 'openai') {
        let assertionsPassed = false
        try {
          await expect(page.getByTestId('transcription-partial')).toHaveText(
            'I would like to buy a Fender Stratocaster please',
          )
          await expect(page.getByTestId('generation-status')).toHaveText(
            'loading',
          )
          assertionsPassed = true
        } finally {
          const response = await request
            .post(
              `http://127.0.0.1:${aimockPort}/transcription-stream/release`,
              { headers: { 'x-test-id': testId } },
            )
            .catch((error: unknown) => {
              if (assertionsPassed) throw error
              return undefined
            })
          if (assertionsPassed) expect(response?.status()).toBe(204)
        }
      }
      await waitForGenerationComplete(page)
      const text = await page.getByTestId('transcription-text').innerText()
      expect(text).toContain('Fender Stratocaster')
    })

    test('fetcher -- transcribes audio via server function', async ({
      page,
      request,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'transcription', testId, aimockPort, 'fetcher'),
      )
      await clickGenerate(page)
      if (provider === 'openai') {
        let assertionsPassed = false
        try {
          await expect(page.getByTestId('transcription-partial')).toHaveText(
            'I would like to buy a Fender Stratocaster please',
          )
          await expect(page.getByTestId('generation-status')).toHaveText(
            'loading',
          )
          assertionsPassed = true
        } finally {
          const response = await request
            .post(
              `http://127.0.0.1:${aimockPort}/transcription-stream/release`,
              { headers: { 'x-test-id': testId } },
            )
            .catch((error: unknown) => {
              if (assertionsPassed) throw error
              return undefined
            })
          if (assertionsPassed) expect(response?.status()).toBe(204)
        }
      }
      await waitForGenerationComplete(page)
      const text = await page.getByTestId('transcription-text').innerText()
      expect(text).toContain('Fender Stratocaster')
    })

    if (provider === 'openai') {
      test('sse -- cancels the provider stream when the reader cancels', async ({
        page,
        request,
        testId,
        aimockPort,
      }) => {
        await page.goto(
          featureUrl(provider, 'transcription', testId, aimockPort, 'sse'),
        )
        let assertionsPassed = false
        try {
          const cancellationCompleted = await page.evaluate(
            async ({ testId, aimockPort }) => {
              const controller = new AbortController()
              const response = await fetch('/api/transcription', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  threadId: testId,
                  audio: 'data:audio/mpeg;base64,SGVsbG8=',
                  language: 'en',
                  provider: 'openai',
                  testId,
                  aimockPort,
                }),
                signal: controller.signal,
              })
              if (!response.body) return false

              const reader = response.body.getReader()
              const decoder = new TextDecoder()
              let buffer = ''
              while (true) {
                const { done, value } = await reader.read()
                if (done) return false
                buffer += decoder.decode(value, { stream: true })
                if (buffer.includes('"type":"TEXT_MESSAGE_CONTENT"')) {
                  const cancelled = await Promise.race([
                    reader.cancel().then(() => true),
                    new Promise<boolean>((resolve) =>
                      setTimeout(() => resolve(false), 5_000),
                    ),
                  ])
                  if (!cancelled) controller.abort()
                  return cancelled
                }
              }
            },
            { testId, aimockPort },
          )
          expect(cancellationCompleted).toBe(true)
          await expect
            .poll(
              async () => {
                const response = await request.get(
                  `http://127.0.0.1:${aimockPort}/transcription-stream/status?testId=${encodeURIComponent(testId)}`,
                )
                if (!response.ok())
                  return { closedByClient: false, pending: false }
                return response.json()
              },
              { timeout: 3_000 },
            )
            .toMatchObject({
              closedByClient: true,
              closedWhilePending: true,
            })
          assertionsPassed = true
        } finally {
          const response = await request
            .post(
              `http://127.0.0.1:${aimockPort}/transcription-stream/release`,
              { headers: { 'x-test-id': testId } },
            )
            .catch((error: unknown) => {
              if (assertionsPassed) throw error
              return undefined
            })
          if (assertionsPassed) expect([204, 404]).toContain(response?.status())
        }
      })
    }
  })
}

for (const provider of providersFor('transcription-diarization')) {
  test.describe(`${provider} -- transcription-diarization`, () => {
    for (const mode of ['sse', 'http-stream', 'fetcher'] as const) {
      test(`${mode} -- transcribes diarized audio`, async ({
        page,
        testId,
        aimockPort,
      }) => {
        await page.goto(
          featureUrl(
            provider,
            'transcription-diarization',
            testId,
            aimockPort,
            mode,
          ),
        )
        await clickGenerate(page)
        await waitForGenerationComplete(page)

        await expect(page.getByTestId('transcription-text')).toContainText(
          'Fender Stratocaster',
        )
        await expect(page.getByTestId('transcription-segments')).toContainText(
          'Welcome to the store',
        )
        await expect(page.getByTestId('transcription-segments')).toContainText(
          'I need a Fender Stratocaster',
        )
        await expect(page.getByTestId('transcription-speaker-0')).toHaveText(
          'agent',
        )
        await expect(page.getByTestId('transcription-speaker-1')).toHaveText(
          'customer',
        )
      })
    }
  })
}
