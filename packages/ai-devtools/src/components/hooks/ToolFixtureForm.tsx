import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { useAIStore } from '../../store/ai-context'
import { useStyles } from '../../styles/use-styles'
import { FixtureNamePopover } from './FixtureNamePopover'
import type {
  HookRecord,
  RegisteredTool,
  ToolFixtureRecord,
} from '../../store/hook-registry'
import type { Component } from 'solid-js'

interface ToolFixtureFormProps {
  hook: HookRecord
  tool: RegisteredTool
  onFire: (fixture: ToolFixtureRecord) => void
}

interface SchemaField {
  name: string
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'
  required: boolean
  description?: string
}

export const ToolFixtureForm: Component<ToolFixtureFormProps> = (props) => {
  const { saveToolFixture } = useAIStore()
  const styles = useStyles()
  const fields = createMemo(() => fieldsFromSchema(props.tool.inputSchema))
  const [inputValues, setInputValues] = createSignal<Record<string, string>>(
    defaultValues(fields()),
  )
  const [rawInput, setRawInput] = createSignal('{}')
  const [output, setOutput] = createSignal('null')
  const [error, setError] = createSignal<string | null>(null)
  const [pendingSaveName, setPendingSaveName] = createSignal<string | null>(
    null,
  )

  createEffect(() => {
    void props.tool.name
    setInputValues(defaultValues(fields()))
    setRawInput('{}')
    setOutput('null')
    setError(null)
    setPendingSaveName(null)
  })

  const setFieldValue = (name: string, value: string) => {
    setInputValues((current) => ({ ...current, [name]: value }))
  }

  const createFixture = (name?: string): ToolFixtureRecord | undefined => {
    try {
      setError(null)
      const createdAt = Date.now()
      const parsedInput =
        fields().length > 0
          ? parseObjectInput(fields(), inputValues())
          : parseJson(rawInput(), 'Input')
      const parsedOutput = parseJson(output(), 'Output')
      return {
        id: `fixture:${props.hook.id}:${props.tool.name}:${createdAt}:${Math.random()
          .toString(36)
          .slice(2)}`,
        createdAt,
        ...(name ? { name } : {}),
        hookId: props.hook.id,
        ...(props.hook.threadId ? { threadId: props.hook.threadId } : {}),
        toolName: props.tool.name,
        input: parsedInput,
        output: parsedOutput,
        execute: true,
      }
    } catch (fixtureError) {
      setError(
        fixtureError instanceof Error
          ? fixtureError.message
          : 'Unable to create fixture.',
      )
      return undefined
    }
  }

  const handleFire = () => {
    const fixture = createFixture()
    if (!fixture) return
    props.onFire(fixture)
  }

  const handleSave = () => {
    setPendingSaveName(`${props.tool.name} fixture`)
  }

  const handleConfirmSave = (name: string) => {
    const fixture = createFixture(name)
    if (!fixture) return
    saveToolFixture(fixture)
    setPendingSaveName(null)
  }

  return (
    <div
      class={styles().hookDetails.fixtureForm}
      data-testid="ai-devtools-tool-fixture-form"
      data-tool-name={props.tool.name}
    >
      <div class={styles().hookDetails.sectionTitle}>Tool Fixture</div>
      <div class={styles().hookDetails.fixtureHelp}>
        {props.tool.description || props.tool.name}
      </div>

      <Show
        when={fields().length > 0}
        fallback={
          <label class={styles().hookDetails.fixtureField}>
            <span class={styles().hookDetails.fixtureLabel}>Input JSON</span>
            <textarea
              class={styles().hookDetails.fixtureTextarea}
              value={rawInput()}
              onInput={(event) => setRawInput(event.currentTarget.value)}
              spellcheck={false}
            />
          </label>
        }
      >
        <For each={fields()}>
          {(field) => (
            <label class={styles().hookDetails.fixtureField}>
              <span class={styles().hookDetails.fixtureLabel}>
                {field.name}
                <Show when={field.required}>
                  <span class={styles().hookDetails.requiredMark}>*</span>
                </Show>
              </span>
              <Show when={field.description}>
                <span class={styles().hookDetails.fixtureHelp}>
                  {field.description}
                </span>
              </Show>
              <FieldInput
                field={field}
                value={inputValues()[field.name] ?? ''}
                onInput={(value) => setFieldValue(field.name, value)}
              />
            </label>
          )}
        </For>
      </Show>

      <label class={styles().hookDetails.fixtureField}>
        <span class={styles().hookDetails.fixtureLabel}>Output JSON</span>
        <textarea
          class={styles().hookDetails.fixtureTextarea}
          value={output()}
          onInput={(event) => setOutput(event.currentTarget.value)}
          spellcheck={false}
        />
      </label>

      <Show when={error()}>
        {(message) => (
          <div class={styles().hookDetails.fixtureError}>{message()}</div>
        )}
      </Show>

      <div class={styles().hookDetails.fixtureActions}>
        <button
          class={styles().hookDetails.fixtureButton}
          data-testid="ai-devtools-tool-fire"
          type="button"
          onClick={handleFire}
        >
          Fire
        </button>
        <button
          class={`${styles().hookDetails.fixtureButton} ${styles().hookDetails.fixtureButtonSecondary}`}
          data-testid="ai-devtools-tool-save"
          type="button"
          onClick={handleSave}
        >
          Save
        </button>
      </div>
      <Show when={pendingSaveName()}>
        {(defaultName) => (
          <FixtureNamePopover
            defaultName={defaultName()}
            onCancel={() => setPendingSaveName(null)}
            onSave={handleConfirmSave}
          />
        )}
      </Show>
    </div>
  )
}

const FieldInput: Component<{
  field: SchemaField
  value: string
  onInput: (value: string) => void
}> = (props) => {
  const styles = useStyles()

  if (props.field.type === 'boolean') {
    return (
      <select
        class={styles().hookDetails.fixtureInput}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      >
        <option value="false">false</option>
        <option value="true">true</option>
      </select>
    )
  }

  if (props.field.type === 'object' || props.field.type === 'array') {
    return (
      <textarea
        class={styles().hookDetails.fixtureTextarea}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        spellcheck={false}
      />
    )
  }

  return (
    <input
      class={styles().hookDetails.fixtureInput}
      type={props.field.type === 'string' ? 'text' : 'number'}
      value={props.value}
      onInput={(event) => props.onInput(event.currentTarget.value)}
    />
  )
}

function fieldsFromSchema(schema: unknown): Array<SchemaField> {
  if (!isJsonSchemaObject(schema)) return []
  const properties = schema.properties
  if (!isRecord(properties)) return []
  const required = Array.isArray(schema.required)
    ? new Set(
        schema.required.filter(
          (item): item is string => typeof item === 'string',
        ),
      )
    : new Set<string>()

  return Object.entries(properties).map(([name, property]) => {
    const propertySchema = isJsonSchemaObject(property) ? property : undefined
    const type = normalizeType(propertySchema?.type)
    return {
      name,
      type,
      required: required.has(name),
      ...(typeof propertySchema?.description === 'string'
        ? { description: propertySchema.description }
        : {}),
    }
  })
}

function defaultValues(fields: Array<SchemaField>): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of fields) {
    if (field.type === 'boolean') {
      values[field.name] = 'false'
    } else if (field.type === 'number' || field.type === 'integer') {
      values[field.name] = '0'
    } else if (field.type === 'array') {
      values[field.name] = '[]'
    } else if (field.type === 'object') {
      values[field.name] = '{}'
    } else {
      values[field.name] = ''
    }
  }
  return values
}

function parseObjectInput(
  fields: Array<SchemaField>,
  values: Record<string, string>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  for (const field of fields) {
    const rawValue = values[field.name] ?? ''
    if (!field.required && rawValue.length === 0) {
      continue
    }
    input[field.name] = parseFieldValue(field, rawValue)
  }
  return input
}

function parseFieldValue(field: SchemaField, rawValue: string): unknown {
  if (field.type === 'boolean') return rawValue === 'true'
  if (field.type === 'number') {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) {
      throw new Error(`${field.name} must be a number.`)
    }
    return value
  }
  if (field.type === 'integer') {
    const value = Number(rawValue)
    if (!Number.isInteger(value)) {
      throw new Error(`${field.name} must be an integer.`)
    }
    return value
  }
  if (field.type === 'object' || field.type === 'array') {
    return parseJson(rawValue, field.name)
  }
  return rawValue
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${label} must be valid JSON.`)
  }
}

function normalizeType(value: unknown): SchemaField['type'] {
  if (value === 'boolean') return 'boolean'
  if (value === 'number') return 'number'
  if (value === 'integer') return 'integer'
  if (value === 'array') return 'array'
  if (value === 'object') return 'object'
  return 'string'
}

function isJsonSchemaObject(value: unknown): value is {
  type?: unknown
  description?: unknown
  properties?: unknown
  required?: unknown
} {
  return isRecord(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
