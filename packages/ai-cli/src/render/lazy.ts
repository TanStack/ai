/**
 * Lazy render boundary.
 *
 * Every function here dynamically imports the Ink implementation so that React,
 * the Ink reconciler, and ink-picture are loaded ONLY on the interactive/pretty
 * path. The machine path (`--json` / `--stream` / non-TTY) never touches them,
 * keeping cold start fast for agent harnesses.
 */

import type { MenuChoice } from './menu'
import type { ReplMessage } from './repl'

export interface RenderedImage {
  path: string
  revisedPrompt?: string
}

export async function renderImageResult(input: {
  model: string
  images: Array<RenderedImage>
  preview: boolean
}): Promise<void> {
  const { renderImageResultInk } = await import('./ink')
  await renderImageResultInk(input)
}

export async function renderText(text: string): Promise<void> {
  const { renderTextInk } = await import('./ink')
  await renderTextInk(text)
}

export async function renderArtifactPath(input: {
  label: string
  path: string
  meta?: Record<string, unknown>
}): Promise<void> {
  const { renderArtifactPathInk } = await import('./ink')
  await renderArtifactPathInk(input)
}

export async function renderMenu(): Promise<MenuChoice> {
  const { runMenuInk } = await import('./menu')
  return runMenuInk()
}

export async function renderChatRepl(input: {
  model: string
  respond: (messages: Array<ReplMessage>) => Promise<string>
}): Promise<void> {
  const { runChatReplInk } = await import('./repl')
  await runChatReplInk(input)
}
