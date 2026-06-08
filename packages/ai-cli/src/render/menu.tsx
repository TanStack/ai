import { useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { DIM, PINK } from './theme'
import { forceExit, isCtrlC } from './exit'
import { WelcomeHeader, loadLogo } from './welcome'

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
  {
    command: 'chat',
    label: 'Chat',
    hint: 'Interactive agentic chat',
    needsPrompt: false,
  },
  {
    command: 'image',
    label: 'Image',
    hint: 'Generate an image',
    needsPrompt: true,
  },
  {
    command: 'video',
    label: 'Video',
    hint: 'Generate a video',
    needsPrompt: true,
  },
  {
    command: 'audio',
    label: 'Audio',
    hint: 'Generate music / sfx',
    needsPrompt: true,
  },
  {
    command: 'speech',
    label: 'Speech',
    hint: 'Text to speech',
    needsPrompt: true,
  },
  {
    command: 'summarize',
    label: 'Summarize',
    hint: 'Summarize text',
    needsPrompt: true,
  },
  {
    command: 'transcribe',
    label: 'Transcribe',
    hint: 'Audio file to text',
    needsPrompt: true,
  },
  { command: 'quit', label: 'Quit', hint: 'Exit', needsPrompt: false },
]

function Menu({
  onChoose,
  logo,
  animate,
}: {
  onChoose: (choice: MenuChoice) => void
  logo: string | null
  animate: boolean
}) {
  const { exit } = useApp()
  const [index, setIndex] = useState(0)
  const [promptFor, setPromptFor] = useState<MenuItem | null>(null)
  const [draft, setDraft] = useState('')

  useInput((input, key) => {
    if (isCtrlC(input, key)) forceExit()
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
        <WelcomeHeader logo={logo} />
        <Text>
          <Text color={PINK}>{promptFor.label}</Text>
          <Text color={DIM}> › </Text>
          <Text>{draft}</Text>
          <Text color={DIM}>▌</Text>
        </Text>
        <Text color={DIM}>Enter to run · Esc to go back</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <WelcomeHeader logo={logo} animate={animate} />
      <Text color={DIM}>What do you want to do?</Text>
      <Box flexDirection="column" marginTop={1}>
        {ITEMS.map((item, i) => {
          const active = i === index
          return (
            <Text key={item.command}>
              <Text color={PINK}>{active ? '❯ ' : '  '}</Text>
              <Text color={active ? PINK : undefined} bold={active}>
                {item.label}
              </Text>
              <Text color={DIM}> — {item.hint}</Text>
            </Text>
          )
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={DIM}>↑/↓ to move · Enter to select · Esc to quit</Text>
      </Box>
    </Box>
  )
}

/** Render the home screen and resolve the user's choice. */
export async function runMenuInk(animate = true): Promise<MenuChoice> {
  const logo = await loadLogo()
  // Clear the screen (and scrollback) so the welcome splash starts clean.
  if (process.stdout.isTTY) process.stdout.write('[2J[3J[H')
  return new Promise((resolve) => {
    let choice: MenuChoice = { command: 'quit' }
    const { waitUntilExit } = render(
      <Menu
        logo={logo}
        animate={animate}
        onChoose={(c) => {
          choice = c
        }}
      />,
      { exitOnCtrlC: false },
    )
    void waitUntilExit().then(() => resolve(choice))
  })
}
