/**
 * Shadow-DOM chat panel UI for Coco. Vanilla TS, no framework.
 *
 * Owns:
 *
 * - the floating launcher + the panel element,
 * - rendering of `UIMessage[]` (text, thinking, tool-call parts),
 * - the agent / mode selectors,
 * - the context chips (current route + currently picked element),
 * - the setup dialog shown when the chosen agent isn't configured.
 *
 * The chat I/O itself lives in `chat.ts` (ChatClient wrapper); this module
 * accepts callbacks from `index.ts` so the two stay independent.
 */
import { AGENTS, AGENT_SETUP, DEFAULT_AGENT } from '../agents.ts'
import { PANEL_CSS } from './styles.ts'
import type { AgentId, AgentMode } from '../agents.ts'
import type { SelectedElement } from './context.ts'
import type { UIMessage } from '@tanstack/ai-client'

export interface AgentStatus {
  installed: boolean
  configured: boolean
}

export type AgentStatusMap = Record<AgentId, AgentStatus>

/** @deprecated Kept for backwards compat; prefer `AgentStatusMap`. */
export type AgentConfigMap = AgentStatusMap

export interface PanelCallbacks {
  send: (text: string) => void
  newSession: () => void
  selectAgent: (id: AgentId) => void
  selectMode: (mode: AgentMode) => void
  togglePicker: () => void
  clearSelection: () => void
  openSetup: (id: AgentId) => void
  closeSetup: () => void
  openPanel: () => void
  closePanel: () => void
}

export interface PanelState {
  open: boolean
  agent: AgentId
  mode: AgentMode
  /**
   * Per-agent install + credential status. `null` when we haven't fetched
   * `/__coco/api/agents` yet (or it errored); when null the panel shows a
   * soft "(checking…)" and DOES NOT block sends — we let the server's
   * response speak for itself.
   */
  configured: AgentStatusMap | null
  route: string
  selected: SelectedElement | null
  picking: boolean
  messages: Array<UIMessage>
  isLoading: boolean
  /**
   * High-level status for the in-flight indicator. `idle` means nothing is
   * happening; `sending` is the moment between submit and the first server
   * chunk; `streaming` is once we've started receiving chunks.
   */
  status: 'idle' | 'sending' | 'streaming'
  error: string | null
  setupOpen: AgentId | null
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const truncate = (s: string, n: number) =>
  s.length <= n ? s : s.slice(0, n - 1) + '…'

const renderMessage = (m: UIMessage): string => {
  if (m.role === 'user') {
    const text = m.parts
      .filter((p): p is { type: 'text'; content: string } => p.type === 'text')
      .map((p) => p.content)
      .join('')
    return `<div class="msg user"><div class="bubble">${escapeHtml(text)}</div></div>`
  }
  if (m.role !== 'assistant') return ''
  const parts = m.parts
    .map((p) => {
      if (p.type === 'text' && p.content.trim()) {
        return `<div class="text">${escapeHtml(p.content)}</div>`
      }
      if (p.type === 'thinking' && p.content.trim()) {
        return `<div class="thinking">${escapeHtml(p.content)}</div>`
      }
      if (p.type === 'tool-call') {
        let args = p.arguments
        try {
          args = JSON.stringify(JSON.parse(p.arguments), null, 2)
        } catch {
          // keep raw
        }
        const output =
          p.output === undefined
            ? ''
            : `<pre>${escapeHtml(
                typeof p.output === 'string'
                  ? p.output
                  : JSON.stringify(p.output, null, 2),
              )}</pre>`
        const state = p.output !== undefined ? 'done' : p.state
        return `<details class="tool">
          <summary>🔧 ${escapeHtml(p.name)}<span class="state">${escapeHtml(String(state))}</span></summary>
          <div class="body">
            <pre>${escapeHtml(args ?? '')}</pre>
            ${output}
          </div>
        </details>`
      }
      return ''
    })
    .join('')
  return `<div class="msg assistant">${parts}</div>`
}

/**
 * Render the entire panel root from a snapshot of state.
 *
 * We do a coarse full-rerender of the messages region; for ~hundreds of
 * messages this is more than fast enough and keeps the implementation
 * tiny. A more sophisticated diff is overkill for an example.
 */
export class Panel {
  readonly hostElement: HTMLElement
  readonly root: ShadowRoot
  private readonly rootEl: HTMLElement
  private readonly callbacks: PanelCallbacks
  private state: PanelState
  private inputDraft = ''

  constructor(callbacks: PanelCallbacks, initial?: Partial<PanelState>) {
    this.callbacks = callbacks
    this.state = {
      open: false,
      agent: DEFAULT_AGENT,
      mode: 'edit',
      configured: null,
      route: window.location.pathname,
      selected: null,
      picking: false,
      messages: [],
      isLoading: false,
      status: 'idle',
      error: null,
      setupOpen: null,
      ...initial,
    }

    this.hostElement = document.createElement('div')
    this.hostElement.id = '__coco-host'
    this.hostElement.style.all = 'initial'
    this.root = this.hostElement.attachShadow({ mode: 'open' })

    const styleEl = document.createElement('style')
    styleEl.textContent = PANEL_CSS
    this.root.appendChild(styleEl)

    this.rootEl = document.createElement('div')
    this.rootEl.className = 'root'
    this.root.appendChild(this.rootEl)

    this.render()
  }

  setState(patch: Partial<PanelState>) {
    this.state = { ...this.state, ...patch }
    this.render()
  }

  getState(): Readonly<PanelState> {
    return this.state
  }

  /**
   * Render is intentionally idempotent — we recreate the DOM each time
   * and re-bind events. To preserve the user's draft mid-typing we read
   * the textarea before the rebuild and write it back after.
   */
  private render() {
    const ta = this.rootEl.querySelector<HTMLTextAreaElement>('.input')
    if (ta) this.inputDraft = ta.value

    const s = this.state
    const launcherHtml = `
      <button class="launcher${s.open ? ' hidden' : ''}${s.status !== 'idle' ? ' busy' : ''}" type="button" aria-label="Open Coco">
        🥥${s.status !== 'idle' ? '<span class="launcher-dot"></span>' : ''}
      </button>
    `

    const setupHtml = s.setupOpen ? this.renderSetup(s.setupOpen) : ''

    // `configured === null` means we haven't successfully fetched the agent
    // status yet — show a soft pending hint but never block the user.
    const cfgKnown = s.configured !== null
    const isConfigured = cfgKnown && s.configured![s.agent].configured
    const notice =
      cfgKnown && !isConfigured
        ? `<div class="notice">
            <span style="flex:1">⚠️ ${escapeHtml(AGENT_SETUP[s.agent].label)} isn't configured. Sending anyway will likely fail.</span>
            <button class="btn" data-action="open-setup">Setup</button>
          </div>`
        : ''

    const chips: Array<string> = []
    chips.push(
      `<span class="chip" title="Current route">📍 <code>${escapeHtml(s.route)}</code></span>`,
    )
    if (s.selected) {
      const label = s.selected.selector || `<${s.selected.tagName}>`
      chips.push(
        `<span class="chip" title="Selected element"><code>${escapeHtml(truncate(label, 80))}</code><span class="x" data-action="clear-selection" title="Clear">✕</span></span>`,
      )
    }

    const errorHtml = s.error
      ? `<div class="error">⚠ ${escapeHtml(s.error)}</div>`
      : ''

    const statusLabel = s.error
      ? `Error — see message above`
      : s.status === 'sending'
        ? `Sending to ${s.agent}…`
        : s.status === 'streaming'
          ? `Streaming from ${s.agent}…`
          : !cfgKnown
            ? 'Checking agent status…'
            : `Ready (${s.agent}, ${s.mode})`
    const statusClass = s.error
      ? 'error'
      : s.status === 'idle'
        ? 'idle'
        : s.status
    const statusBarHtml = `<div class="status-bar ${statusClass}"><span class="status-dot"></span><span>${escapeHtml(statusLabel)}</span></div>`

    const thinkingHtml =
      s.status !== 'idle'
        ? `<div class="thinking-pill" role="status" aria-live="polite">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            <span class="label">${
              s.status === 'sending'
                ? 'Coco is calling the agent…'
                : 'Coco is working…'
            }</span>
          </div>`
        : ''

    const messagesHtml =
      s.messages.length === 0 && s.status === 'idle'
        ? `<div class="empty">Ask Coco to change something in this page. Try “make the heading larger” or click 🎯 to point at an element.</div>`
        : s.messages.map(renderMessage).join('') + thinkingHtml

    const panelHtml = `
      <div class="panel${s.open ? '' : ' hidden'}" role="dialog" aria-label="Coco">
        <div class="header">
          <span class="title"><span class="title-emoji">🥥</span>Coco</span>
          <select class="select" data-control="agent" aria-label="Agent">
            ${AGENTS.filter((a) => {
              if (!cfgKnown) return true
              return s.configured![a.id].installed || a.id === s.agent
            })
              .map((a) => {
                const status = cfgKnown ? s.configured![a.id] : null
                const tag = !status
                  ? ''
                  : !status.installed
                    ? ' (not installed)'
                    : !status.configured
                      ? ' (setup)'
                      : ''
                return `<option value="${a.id}"${a.id === s.agent ? ' selected' : ''}>${escapeHtml(a.label)}${tag}</option>`
              })
              .join('')}
          </select>
          <select class="select" data-control="mode" aria-label="Mode">
            <option value="edit"${s.mode === 'edit' ? ' selected' : ''}>Edit</option>
            <option value="read-only"${s.mode === 'read-only' ? ' selected' : ''}>Read-only</option>
          </select>
          <button class="btn icon${s.picking ? ' active' : ''}" data-action="toggle-picker" title="Pick an element">🎯</button>
          <button class="btn icon" data-action="new-session" title="New session">⟳</button>
          <button class="btn icon" data-action="close-panel" title="Close">✕</button>
        </div>
        ${notice}
        <div class="context-bar">${chips.join('')}</div>
        <div class="messages">${messagesHtml}</div>
        ${errorHtml}
        <form class="composer" data-action="send-form">
          <textarea class="input" rows="1" placeholder="${s.picking ? 'Click an element on the page…' : 'Ask Coco to change this page…'}" ${s.picking ? 'disabled' : ''}></textarea>
          <button class="btn primary" type="submit" ${s.status !== 'idle' || s.picking ? 'disabled' : ''}>${
            s.status !== 'idle' ? '…' : 'Send'
          }</button>
        </form>
        ${statusBarHtml}
        ${setupHtml}
      </div>
    `

    this.rootEl.innerHTML = launcherHtml + panelHtml

    // Restore draft + scroll
    const newTa = this.rootEl.querySelector<HTMLTextAreaElement>('.input')
    if (newTa && !s.picking) {
      newTa.value = this.inputDraft
      newTa.focus({ preventScroll: true })
    }
    const messagesEl = this.rootEl.querySelector<HTMLElement>('.messages')
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight

    this.bindEvents()
  }

  private renderSetup(id: AgentId): string {
    const setup = AGENT_SETUP[id]
    return `
      <div class="setup-mask" data-action="setup-mask">
        <div class="setup-card" data-stop-click>
          <h2>Set up ${escapeHtml(setup.label)}</h2>
          <p>${escapeHtml(setup.summary)}</p>
          <ol>
            ${setup.steps
              .map(
                (step) => `
                <li>
                  <div>${escapeHtml(step.text)}</div>
                  ${step.code ? `<pre>${escapeHtml(step.code)}</pre>` : ''}
                </li>
              `,
              )
              .join('')}
          </ol>
          <div class="actions">
            <a href="${escapeHtml(setup.docsUrl)}" target="_blank" rel="noreferrer">Docs ↗</a>
            <button class="btn primary" data-action="close-setup">Got it</button>
          </div>
        </div>
      </div>
    `
  }

  private bindEvents() {
    const $ = <T extends Element>(sel: string) =>
      this.rootEl.querySelector<T>(sel)
    const $$ = <T extends Element>(sel: string) =>
      this.rootEl.querySelectorAll<T>(sel)

    $<HTMLButtonElement>('.launcher')?.addEventListener('click', () =>
      this.callbacks.openPanel(),
    )

    $$<HTMLElement>('[data-action="open-setup"]').forEach((el) =>
      el.addEventListener('click', () =>
        this.callbacks.openSetup(this.state.agent),
      ),
    )
    $$<HTMLElement>('[data-action="close-setup"]').forEach((el) =>
      el.addEventListener('click', () => this.callbacks.closeSetup()),
    )
    $<HTMLElement>('[data-action="setup-mask"]')?.addEventListener(
      'click',
      (e) => {
        if (e.target === e.currentTarget) this.callbacks.closeSetup()
      },
    )

    $<HTMLButtonElement>('[data-action="close-panel"]')?.addEventListener(
      'click',
      () => this.callbacks.closePanel(),
    )
    $<HTMLButtonElement>('[data-action="new-session"]')?.addEventListener(
      'click',
      () => this.callbacks.newSession(),
    )
    $<HTMLButtonElement>('[data-action="toggle-picker"]')?.addEventListener(
      'click',
      () => this.callbacks.togglePicker(),
    )
    $$<HTMLElement>('[data-action="clear-selection"]').forEach((el) =>
      el.addEventListener('click', () => this.callbacks.clearSelection()),
    )

    $<HTMLSelectElement>('[data-control="agent"]')?.addEventListener(
      'change',
      (e) => {
        const value = (e.target as HTMLSelectElement).value
        if (
          value === 'claude-code' ||
          value === 'codex' ||
          value === 'gemini-cli' ||
          value === 'opencode'
        ) {
          this.callbacks.selectAgent(value)
        }
      },
    )
    $<HTMLSelectElement>('[data-control="mode"]')?.addEventListener(
      'change',
      (e) => {
        const value = (e.target as HTMLSelectElement).value
        if (value === 'edit' || value === 'read-only') {
          this.callbacks.selectMode(value)
        }
      },
    )

    const form = $<HTMLFormElement>('form[data-action="send-form"]')
    form?.addEventListener('submit', (e) => {
      e.preventDefault()
      const ta = $<HTMLTextAreaElement>('.input')
      const text = ta?.value.trim() ?? ''
      console.debug('[coco] form submit', {
        textareaFound: Boolean(ta),
        text,
        rawValue: ta?.value,
      })
      if (!text) return
      ta!.value = ''
      this.inputDraft = ''
      this.callbacks.send(text)
    })
    const ta = $<HTMLTextAreaElement>('.input')
    ta?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        form?.requestSubmit()
      }
    })
  }
}
