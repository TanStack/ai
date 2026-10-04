import { basename } from 'node:path'
import { useMemo } from 'react'
import { Box, Spacer, Text, useAnimation } from 'ink'
import { renderMarkdown } from './markdown'
import { ACCENT, KIND_COLOR, SPINNER } from './theme'
import type {
  AgentPart,
  MediaPart,
  ToolCallPart,
  ViewMessage,
  ViewPart,
} from '@tanstack/ai-harness/view'
import type { Saved } from './media'

export function Spinner({ color = 'yellow' }: { color?: string }) {
  const { frame } = useAnimation({ interval: 90 })
  return <Text color={color}>{SPINNER[frame % SPINNER.length]}</Text>
}

function textOf(parts: ReadonlyArray<ViewPart>) {
  return parts.map((part) => (part.type === 'text' ? part.text : '')).join('')
}

/** A short one-line view of tool arguments. */
function argsPreview(call: ToolCallPart) {
  const text =
    typeof call.args === 'object' && call.args !== null
      ? Object.values(call.args)
          .filter((value) => typeof value === 'string')
          .join(', ')
      : ''
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 70 ? `${line.slice(0, 70)}...` : line
}

function ToolLine({
  call,
  indent = 2,
}: {
  call: ToolCallPart
  indent?: number
}) {
  const icon =
    call.status === 'running' ? (
      <Spinner />
    ) : call.status === 'done' ? (
      <Text color="green">✓</Text>
    ) : call.status === 'failed' ? (
      <Text color="red">✗</Text>
    ) : (
      <Text color="magenta">?</Text>
    )
  const preview = argsPreview(call)
  return (
    <Box marginLeft={indent}>
      {icon}
      <Text color="yellow">{` ${call.name}`}</Text>
      {preview ? <Text dimColor>{`  ${preview}`}</Text> : null}
      {call.status === 'needs-approval' ? (
        <Text color="magenta"> waits for your approval</Text>
      ) : null}
    </Box>
  )
}

function MediaLine({
  part,
  saved,
  indent = 2,
}: {
  part: MediaPart
  saved: ReadonlyArray<Saved>
  indent?: number
}) {
  const item = saved.find((entry) => entry.id === part.id)
  const color = KIND_COLOR[part.kind] ?? 'white'
  return (
    <Box marginLeft={indent}>
      <Text color={color} bold>
        {`▣ ${item ? `${item.number} ` : ''}${part.kind}`}
      </Text>
      <Text>{`  ${part.name}`}</Text>
      {item?.path ? <Text dimColor>{`  -> ${item.path}`}</Text> : null}
      {item?.error ? (
        <Text color="red">{`  not saved: ${item.error}`}</Text>
      ) : null}
      {item && !item.path && !item.error ? (
        <Text dimColor> saving...</Text>
      ) : null}
    </Box>
  )
}

/**
 * A child agent, for example Codex or Claude Code, in its own card: its
 * status, its last tool calls, its media, and its output. While it runs, the
 * last 4 lines show. When it ends, the last 15 lines of its answer stay.
 */
function Agent({
  part,
  saved,
}: {
  part: AgentPart
  saved: ReadonlyArray<Saved>
}) {
  const lines = textOf(part.parts)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
  const running = part.status === 'running'
  const output = running ? lines.slice(-4) : lines.slice(-15)
  const calls = part.parts.flatMap((inner) =>
    inner.type === 'tool-call' ? [inner] : [],
  )
  const media = part.parts.flatMap((inner) =>
    inner.type === 'media' ? [inner] : [],
  )
  const color = part.status === 'failed' ? 'red' : running ? 'yellow' : 'green'
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={1}
      marginLeft={2}
    >
      <Box>
        {running ? (
          <Spinner color={color} />
        ) : (
          <Text color={color}>{part.status === 'done' ? '✓' : '✗'}</Text>
        )}
        <Text bold>{` ${part.name}`}</Text>
        <Spacer />
        <Text color={color}>{part.status}</Text>
      </Box>
      {calls.slice(-4).map((call) => (
        <ToolLine key={call.id} call={call} indent={0} />
      ))}
      {media.map((inner) => (
        <MediaLine key={inner.id} part={inner} saved={saved} indent={0} />
      ))}
      {output.map((line, index) => (
        <Text key={`line-${index}`} dimColor={running}>
          {line}
        </Text>
      ))}
      {part.error ? <Text color="red">{part.error}</Text> : null}
    </Box>
  )
}

/** The model's text as markdown, `width` columns wide. */
function Markdown({ text, width }: { text: string; width: number }) {
  const shown = useMemo(() => renderMarkdown(text, width), [text, width])
  return (
    <Box marginLeft={2}>
      <Text>{shown}</Text>
    </Box>
  )
}

function Part({
  part,
  saved,
  width,
}: {
  part: ViewPart
  saved: ReadonlyArray<Saved>
  width: number
}) {
  switch (part.type) {
    case 'text':
      return <Markdown text={part.text} width={width - 2} />
    case 'reasoning':
      return (
        <Box marginLeft={2}>
          <Text dimColor italic>
            {part.text}
          </Text>
        </Box>
      )
    case 'tool-call':
      return <ToolLine call={part} />
    case 'agent':
      return <Agent part={part} saved={saved} />
    case 'media':
      return <MediaLine part={part} saved={saved} />
  }
}

export function Message({
  message,
  saved,
  width,
}: {
  message: ViewMessage
  saved: ReadonlyArray<Saved>
  /** The terminal width, for the markdown of the model's text. */
  width: number
}) {
  switch (message.role) {
    case 'user': {
      // A voice message names its files as `@"path"`, shown as a file badge.
      const named: Array<string> = []
      const text = message.text
        .replace(/@"([^"]+)"/g, (_match, path: string) => {
          named.push(basename(path))
          return ''
        })
        .trim()
      const files = [
        ...(message.media ?? []).map((part) => `${part.kind} ${part.name}`),
        ...named,
      ]
      return (
        <Box marginTop={1} flexWrap="wrap">
          <Text bold>
            <Text color={ACCENT}>❯ </Text>
            {text}
            {files.length > 0 ? ' ' : ''}
          </Text>
          {files.map((file) => (
            <Text key={file} color="black" backgroundColor={ACCENT}>
              {` ${file} `}
            </Text>
          ))}
        </Box>
      )
    }
    case 'notice': {
      const isError = message.kind === 'error'
      // A command's answer, for example "Connected to Notion.", stands out.
      const done =
        message.kind === 'command' &&
        /^(Connected|Disconnected|Model|Effort)\b/.test(message.text)
      return (
        <Box marginLeft={2}>
          <Text color={isError ? 'red' : done ? 'green' : 'gray'} bold={done}>
            {`${isError ? '✗' : done ? '✓' : '·'} ${message.text}`}
          </Text>
        </Box>
      )
    }
    case 'assistant':
      return (
        <Box flexDirection="column" marginTop={1}>
          {message.parts.map((part, index) => (
            <Part key={index} part={part} saved={saved} width={width} />
          ))}
        </Box>
      )
  }
}

/** Does a part still change: a running tool or agent, or media still saving? */
function isLivePart(part: ViewPart, saving: (id: string) => boolean): boolean {
  if (part.type === 'tool-call')
    return part.status === 'running' || part.status === 'needs-approval'
  if (part.type === 'agent')
    return (
      part.status === 'running' ||
      part.parts.some((inner) => isLivePart(inner, saving))
    )
  return part.type === 'media' && saving(part.id)
}

/**
 * How many messages from the start no longer change. The screen prints them
 * once, above the live area, so a long conversation does not redraw.
 * `running`: a turn streams now, so the last assistant message can still
 * grow. The screen never takes back a printed message, so holding the one of
 * the turn before costs nothing.
 */
export function settledCount(
  messages: ReadonlyArray<ViewMessage>,
  saving: (id: string) => boolean,
  running: boolean,
) {
  const lastAssistant = messages
    .map((message) => message.role)
    .lastIndexOf('assistant')
  for (const [index, message] of messages.entries()) {
    if (message.role !== 'assistant') continue
    const streaming = running && index === lastAssistant
    if (streaming || message.parts.some((part) => isLivePart(part, saving)))
      return index
  }
  return messages.length
}
