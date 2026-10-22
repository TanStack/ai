import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { toolDefinition } from '@tanstack/ai'
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

// The notes go in a `notes` folder where you start the app.
const NOTES = join(process.cwd(), 'notes')

const listNotes = toolDefinition({
  name: 'list_notes',
  description: 'List the file names of the saved notes',
  inputSchema: z.object({}),
}).server(async () => ({ notes: await readdir(NOTES).catch(() => []) }))

// A write asks the user first, so the screen shows an approval.
const saveNote = toolDefinition({
  name: 'save_note',
  description: 'Save a note as a Markdown file',
  inputSchema: z.object({ title: z.string(), text: z.string() }),
  needsApproval: true,
}).server(async ({ title, text }) => {
  // The time keeps two notes with the same title apart.
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'note'
  const file = `${Date.now()}-${slug}.md`
  await mkdir(NOTES, { recursive: true })
  await writeFile(join(NOTES, file), text)
  return { saved: file }
})

export const assistant = defineHarness({
  name: 'example/notes',
  adapter: openaiText('gpt-6.1-sol'),
  systemPrompts: [
    'You help the user write short notes. Save a note only when the user asks.',
  ],
  tools: [listNotes, saveNote],
})
