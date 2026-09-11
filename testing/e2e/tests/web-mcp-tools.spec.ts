import { expect, test } from '@playwright/test'

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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
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
        return [...registrations.values()].map(({ descriptor }) => ({
          ...descriptor,
        }))
      }

      async executeTool(tool: RegisteredWebMCPTool, inputArguments: string) {
        const registration = registrations.get(tool.name)
        if (!registration) {
          throw new DOMException('Tool not found', 'NotFoundError')
        }
        if (typeof inputArguments !== 'string') {
          throw new DOMException(
            'Failed to parse input arguments',
            'UnknownError',
          )
        }

        let input: object
        try {
          const parsed: unknown = JSON.parse(inputArguments)
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
  })
})

test('WebMCP discovers, executes, and removes a React tool', async ({
  page,
}) => {
  await page.goto('/web-mcp-tools')

  await expect(page.getByTestId('registered-count')).toHaveText('1')

  await page.getByRole('button', { name: 'Execute WebMCP tool' }).click()
  await expect(page.getByTestId('tool-result')).toHaveText('Found guitar')

  await page.getByRole('button', { name: 'Unmount tool owner' }).press('Enter')
  await expect(page.getByTestId('registered-count')).toHaveText('0')
})
