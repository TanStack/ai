import { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'

/** A selectable action from the home menu. */
export interface MenuChoice {
  /** Command to run, or 'quit'. */
  command: string
  /** Prompt text the user typed (for non-chat commands). */
  prompt?: string
}

interface MenuItem {
  command: string
  label: string
  hint: string
  /** Whether this command needs a prompt typed before running. */
  needsPrompt: boolean
}

const ITEMS: Array<MenuItem> = [
  { command: 'chat', label: 'Chat', hint: 'Interactive agentic chat', needsPrompt: false },
  { command: 'image', label: 'Image', hint: 'Generate an image', needsPrompt: true },
  { command: 'video', label: 'Video', hint: 'Generate a video', needsPrompt: true },
  { command: 'audio', label: 'Audio', hint: 'Generate music / sfx', needsPrompt: true },
  { command: 'speech', label: 'Speech', hint: 'Text to speech', needsPrompt: true },
  { command: 'summarize', label: 'Summarize', hint: 'Summarize text', needsPrompt: true },
  { command: 'transcribe', label: 'Transcribe', hint: 'Audio file to text', needsPrompt: true },
  { command: 'quit', label: 'Quit', hint: 'Exit', needsPrompt: false },
]

const TITLE = 'TANSTACK AI'
const GRADIENT = ['cyan', 'cyanBright', 'blueBright', 'magenta', 'magentaBright', 'blueBright']

/** Animated wordmark: a gradient sweeps across the letters. */
function Title() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 90)
    return () => clearInterval(id)
  }, [])
  return (
    <Box marginBottom={1}>
      <Text bold>
        {TITLE.split('').map((ch, i) => (
          <Text key={i} color={GRADIENT[(i + tick) % GRADIENT.length]}>
            {ch}
          </Text>
        ))}
      </Text>
    </Box>
  )
}

function Menu({ onChoose }: { onChoose: (choice: MenuChoice) => void }) {
  const { exit } = useApp()
  const [index, setIndex] = useState(0)
  const [promptFor, setPromptFor] = useState<MenuItem | null>(null)
  const [draft, setDraft] = useState('')

  useInput((input, key) => {
    if (promptFor) {
      if (key.return) {
        onChoose({ command: promptFor.command, prompt: draft })
        exit()
        return
      }
      if (key.escape) {
        setPromptFor(null)
        setDraft('')
        return
      }
      if (key.backspace || key.delete) {
        setDraft((d) => d.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) setDraft((d) => d + input)
      return
    }

    if (key.upArrow) setIndex((i) => (i - 1 + ITEMS.length) % ITEMS.length)
    else if (key.downArrow) setIndex((i) => (i + 1) % ITEMS.length)
    else if (key.return) {
      const item = ITEMS[index]
      if (!item) return
      if (item.command === 'quit') {
        onChoose({ command: 'quit' })
        exit()
      } else if (item.needsPrompt) {
        setPromptFor(item)
      } else {
        onChoose({ command: item.command })
        exit()
      }
    } else if (key.escape) {
      onChoose({ command: 'quit' })
      exit()
    }
  })

  if (promptFor) {
    return (
      <Box flexDirection="column">
        <Title />
        <Text>
          {promptFor.label}: <Text color="cyan">{draft}</Text>
          <Text color="gray">▌</Text>
        </Text>
        <Text dimColor>Enter to run · Esc to go back</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Title />
      <Text dimColor>What do you want to do?</Text>
      <Box flexDirection="column" marginTop={1}>
        {ITEMS.map((item, i) => (
          <Text key={item.command} color={i === index ? 'cyan' : undefined}>
            {i === index ? '❯ ' : '  '}
            <Text bold={i === index}>{item.label}</Text>
            <Text dimColor> — {item.hint}</Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑/↓ to move · Enter to select · Esc to quit</Text>
      </Box>
    </Box>
  )
}

/** Render the home screen and resolve the user's choice. */
export function runMenuInk(): Promise<MenuChoice> {
  return new Promise((resolve) => {
    let choice: MenuChoice = { command: 'quit' }
    const { waitUntilExit } = render(
      <Menu
        onChoose={(c) => {
          choice = c
        }}
      />,
    )
    void waitUntilExit().then(() => resolve(choice))
  })
}
