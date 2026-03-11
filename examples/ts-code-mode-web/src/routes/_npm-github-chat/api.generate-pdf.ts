import { createFileRoute } from '@tanstack/react-router'
import puppeteer from 'puppeteer'
import { marked } from 'marked'
import type { UIMessage } from '@tanstack/ai-client'

interface MessagePart {
  type: string
  content?: string
  name?: string
  arguments?: string
  output?: unknown
}

function messagesToMarkdown(
  messages: Array<UIMessage>,
  title?: string,
): string {
  const lines: Array<string> = []

  // Embed CSS styles directly in the markdown
  lines.push(`<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  line-height: 1.6;
  color: #333;
}
h1 { color: #1a1a1a; border-bottom: 2px solid #0ea5e9; padding-bottom: 0.5em; }
h2 { color: #374151; margin-top: 1.5em; }
h3 { color: #4b5563; }
code { background: #f3f4f6; padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.9em; }
pre { background: #1e293b; color: #e2e8f0; padding: 1em; border-radius: 8px; overflow-x: auto; }
pre code { background: transparent; padding: 0; color: inherit; }
hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
blockquote { border-left: 4px solid #0ea5e9; margin: 1em 0; padding-left: 1em; color: #6b7280; }
</style>`)
  lines.push('')

  lines.push(`# ${title || 'Conversation Export'}`)
  lines.push('')
  lines.push(`*Exported on ${new Date().toLocaleString()}*`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const message of messages) {
    const role =
      message.role === 'assistant' ? '🤖 **Assistant**' : '👤 **User**'
    lines.push(`## ${role}`)
    lines.push('')

    for (const part of message.parts as Array<MessagePart>) {
      if (part.type === 'text' && part.content) {
        lines.push(part.content)
        lines.push('')
      }

      if (part.type === 'tool-call' && part.name === 'execute_typescript') {
        lines.push('### 🔧 Code Execution')
        lines.push('')

        // Parse the arguments to get the code
        let code = ''
        try {
          const args = JSON.parse(part.arguments || '{}')
          code = args.typescriptCode || ''
        } catch {
          code = part.arguments || ''
        }

        if (code) {
          lines.push('```typescript')
          lines.push(code)
          lines.push('```')
          lines.push('')
        }

        // Add output if available
        if (part.output !== undefined) {
          lines.push('**Result:**')
          lines.push('')
          lines.push('```json')
          lines.push(JSON.stringify(part.output, null, 2))
          lines.push('```')
          lines.push('')
        }
      }

      // Handle tool results
      if (part.type === 'tool-result') {
        // Tool results are typically handled with their corresponding tool-call
        // but we can still show them if they appear separately
      }
    }

    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

export const Route = createFileRoute('/_npm-github-chat/api/generate-pdf')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { messages, title } = body as {
            messages: Array<UIMessage>
            title?: string
          }

          if (!messages || !Array.isArray(messages)) {
            return new Response(
              JSON.stringify({ error: 'Messages array is required' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Convert messages to markdown
          const markdown = messagesToMarkdown(messages, title)

          // Convert markdown to HTML, then to PDF via puppeteer
          const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 2em; }
h1 { color: #1a1a1a; border-bottom: 2px solid #0ea5e9; padding-bottom: 0.5em; }
h2 { color: #374151; margin-top: 1.5em; }
h3 { color: #4b5563; }
code { background: #f3f4f6; padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.9em; }
pre { background: #1e293b; color: #e2e8f0; padding: 1em; border-radius: 8px; overflow-x: auto; }
pre code { background: transparent; padding: 0; color: inherit; }
hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
blockquote { border-left: 4px solid #0ea5e9; margin: 1em 0; padding-left: 1em; color: #6b7280; }
</style></head><body>${await marked(markdown)}</body></html>`

          const browser = await puppeteer.launch({ headless: true })
          try {
            const page = await browser.newPage()
            await page.setContent(html, { waitUntil: 'networkidle0' })
            const pdfBuffer = await page.pdf({
              format: 'A4',
              margin: {
                top: '20mm',
                right: '20mm',
                bottom: '20mm',
                left: '20mm',
              },
              printBackground: true,
            })

            const timestamp = new Date()
              .toISOString()
              .replace(/[:.]/g, '-')
              .slice(0, 19)
            const filename = `conversation-${timestamp}.pdf`

            return new Response(new Uint8Array(pdfBuffer), {
              status: 200,
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': pdfBuffer.length.toString(),
              },
            })
          } finally {
            await browser.close()
          }
        } catch (error) {
          console.error('[Generate PDF] Error:', error)
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to generate PDF',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
