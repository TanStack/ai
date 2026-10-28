import { test, expect } from './fixtures'
import {
  sendMessageWithDocument,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDocumentPath = path.resolve(__dirname, '../test-assets/tiny.pdf')

for (const provider of providersFor('multimodal-document')) {
  test.describe(`${provider} — multimodal-document`, () => {
    test('answers a question about an uploaded PDF', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'multimodal-document', testId, aimockPort),
      )

      await sendMessageWithDocument(
        page,
        '[mmdocument] summarize this pdf',
        testDocumentPath,
      )
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('blank page')
    })
  })
}
