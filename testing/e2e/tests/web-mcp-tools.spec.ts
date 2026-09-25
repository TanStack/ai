import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

interface WebMCPToolRegistration {
  name: string
  title?: string
  description: string
  inputSchema?: object
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
  execute: (input: object, options: { signal: AbortSignal }) => Promise<unknown>
}

interface RegisteredWebMCPTool {
  name: string
  title: string
  description: string
  inputSchema?: object
  window: Window
  origin: string
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
}

interface WebMCPRegistration {
  descriptor: RegisteredWebMCPTool
  execute: WebMCPToolRegistration['execute']
}

/**
 * Installs a WebMCP mock that accepts one `executeTool` input form only:
 * - `'string'`: the JSON string that Chrome takes today.
 * - `'object'`: the object that the WebMCP specification takes.
 * A strict mock makes each test prove the form that its caller sends.
 */
async function installModelContext(
  page: Page,
  scenario: 'string' | 'object' | 'duplicate-names',
) {
  await page.addInitScript((mode) => {
    const expectedForm = mode === 'duplicate-names' ? 'object' : mode
    const registrations = new Map<string, WebMCPRegistration>()
    const modelContext = new (class extends EventTarget {
      async registerTool(
        tool: WebMCPToolRegistration,
        options: { signal: AbortSignal },
      ) {
        if (options.signal.aborted) throw options.signal.reason
        if (registrations.has(tool.name)) {
          throw new DOMException('Tool already registered', 'InvalidStateError')
        }

        const descriptor: RegisteredWebMCPTool = {
          name: tool.name,
          title: tool.title ?? '',
          description: tool.description,
          ...(tool.inputSchema === undefined
            ? {}
            : { inputSchema: structuredClone(tool.inputSchema) }),
          window,
          origin: location.origin,
          ...(tool.annotations === undefined
            ? {}
            : { annotations: { ...tool.annotations } }),
        }
        const registration = { descriptor, execute: tool.execute }
        options.signal.addEventListener(
          'abort',
          () => {
            if (registrations.get(tool.name) !== registration) return

            registrations.delete(tool.name)
            this.dispatchEvent(new Event('toolchange'))
          },
          { once: true },
        )

        registrations.set(tool.name, registration)
        this.dispatchEvent(new Event('toolchange'))
      }

      async getTools() {
        const tools = [...registrations.values()].map(({ descriptor }) => ({
          ...descriptor,
        }))
        // Simulate a second frame exposing the same tool names.
        return mode === 'duplicate-names' ? [...tools, ...tools] : tools
      }

      async executeTool(tool: RegisteredWebMCPTool, inputArguments: unknown) {
        const registration = registrations.get(tool.name)
        if (!registration) {
          throw new DOMException('Tool not found', 'NotFoundError')
        }

        const receivedForm =
          typeof inputArguments === 'string' ? 'string' : 'object'
        if (receivedForm !== expectedForm) {
          throw new DOMException(
            `Expected ${expectedForm} input arguments, got ${receivedForm}`,
            'UnknownError',
          )
        }

        let input: object
        try {
          // The specification serializes an object input to JSON before the
          // tool runs, so both forms reach the tool as a parsed object.
          const parsed: unknown =
            typeof inputArguments === 'string'
              ? JSON.parse(inputArguments)
              : JSON.parse(JSON.stringify(inputArguments))
          if (parsed === null || typeof parsed !== 'object') {
            throw new Error('input is not an object')
          }
          input = parsed
        } catch {
          throw new DOMException(
            'Failed to parse input arguments',
            'UnknownError',
          )
        }

        // Chrome currently invokes execute(input) with no options argument.
        const result = await registration.execute(input)
        const serializedResult = JSON.stringify(result)
        if (serializedResult === undefined) {
          throw new TypeError('Tool result is not JSON serializable')
        }

        return serializedResult
      }
    })()

    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: modelContext,
    })
  }, scenario)
}

test('WebMCP discovers, executes, and removes a React tool', async ({
  page,
}) => {
  // The route calls executeTool with a JSON string, as Chrome does.
  await installModelContext(page, 'string')
  await page.goto('/web-mcp-tools')

  await expect(page.getByTestId('registered-count')).toHaveText('1')

  await page.getByRole('button', { name: 'Execute WebMCP tool' }).click()
  await expect(page.getByTestId('tool-result')).toHaveText('Found guitar')

  await page.getByRole('button', { name: 'Unmount tool owner' }).press('Enter')
  await expect(page.getByTestId('registered-count')).toHaveText('0')
})

test('usePageWebMCPTools sends filtered page tools to useChat and runs them', async ({
  page,
  testId,
}) => {
  // usePageWebMCPTools calls executeTool with an object, as the spec does.
  await installModelContext(page, 'object')
  await page.goto(`/web-mcp-page-tools?testId=${encodeURIComponent(testId)}`)

  await expect(page.getByTestId('page-tool-names')).toHaveText('find_guitar')

  await page.getByRole('button', { name: 'Ask the chat' }).click()
  await expect(page.getByTestId('tool-output')).toHaveText(
    '{"message":"Found guitar"}',
  )
  await expect(page.getByTestId('assistant-text')).toContainText(
    'WEBMCP_PAGE_OK',
  )
})

test('duplicate page tool names report an error and stay out of chat', async ({
  page,
}) => {
  await installModelContext(page, 'duplicate-names')
  await page.goto('/web-mcp-page-tools')

  await expect(page.getByRole('alert')).toContainText(
    'Duplicate WebMCP tool name "find_guitar"',
  )
  await expect(page.getByTestId('page-tool-names')).toBeEmpty()
  await expect(
    page.getByRole('button', { name: 'Ask the chat' }),
  ).toBeDisabled()
})
