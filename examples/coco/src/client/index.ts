/**
 * Coco panel entry point — runs in the user's page after the proxy injects
 * `<script src="/__coco/client.js">`. Mounts the Shadow-DOM panel, wires it
 * to a `ChatClient` (talking to `/__coco/api/chat`), tracks the current
 * route, and powers the click-to-select element picker.
 */
import { AGENTS, DEFAULT_AGENT } from '../agents.ts'
import { CocoChat } from './chat.ts'
import { Panel } from './panel.ts'
import { pickElement, watchRoute } from './context.ts'
import type { AgentId, AgentMode } from '../agents.ts'
import type { AgentStatusMap } from './panel.ts'
import type { ElementPickerHandle, SelectedElement } from './context.ts'

const MOUNT_FLAG = '__coco_mounted__'

const fetchAgentConfig = async (): Promise<AgentStatusMap | null> => {
  try {
    const res = await fetch('/__coco/api/agents', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as AgentStatusMap
  } catch (err) {
    console.warn(
      '[coco] failed to fetch /__coco/api/agents; sends will still work but the "needs setup" hint is unavailable.',
      err,
    )
    return null
  }
}

/** First installed agent (used to default the selector when the default is missing). */
const firstInstalled = (status: AgentStatusMap): AgentId | null => {
  for (const a of AGENTS) {
    if (status[a.id].installed) return a.id
  }
  return null
}

const main = async () => {
  const w = window as unknown as Record<string, unknown>
  if (w[MOUNT_FLAG]) return
  w[MOUNT_FLAG] = true

  // Gate panel mount on having at least one supported agent CLI installed.
  // If we can't reach `/__coco/api/agents` (e.g. proxy/plugin not active) we
  // still mount the panel — the legacy proxy CLI relied on this and we don't
  // want to regress that path. Only an explicit "all four uninstalled"
  // response suppresses the panel.
  const initialStatus = await fetchAgentConfig()
  if (initialStatus && !firstInstalled(initialStatus)) {
    console.info(
      '[coco] no supported coding-agent CLI found on PATH; panel hidden. ' +
        'Install one of: claude, codex, gemini, opencode.',
    )
    return
  }

  let picker: ElementPickerHandle | null = null

  // Default to the configured default agent if it's installed; otherwise
  // pick the first installed one we can find.
  let agent: AgentId =
    initialStatus && !initialStatus[DEFAULT_AGENT].installed
      ? (firstInstalled(initialStatus) ?? DEFAULT_AGENT)
      : DEFAULT_AGENT
  let mode: AgentMode = 'edit'

  const panel = new Panel(
    {
      send: (text) => chat.send(text),
      newSession: () => {
        chat.clear()
        panel.setState({ error: null, status: 'idle' })
      },
      selectAgent: (id) => {
        agent = id
        chat.setAgent(id)
        const cfg = panel.getState().configured
        const known = cfg !== null
        panel.setState({
          agent: id,
          setupOpen: known && !cfg[id].configured ? id : null,
        })
      },
      selectMode: (m) => {
        mode = m
        chat.setMode(m)
        panel.setState({ mode: m })
      },
      togglePicker: () => {
        if (picker) {
          picker.cancel()
          picker = null
          panel.setState({ picking: false })
          return
        }
        panel.setState({ picking: true })
        picker = pickElement(panel.hostElement)
        picker.promise.then((selected: SelectedElement | null) => {
          picker = null
          chat.setSelected(selected)
          panel.setState({ picking: false, selected })
        })
      },
      clearSelection: () => {
        chat.setSelected(null)
        panel.setState({ selected: null })
      },
      openSetup: (id) => panel.setState({ setupOpen: id }),
      closeSetup: () => panel.setState({ setupOpen: null }),
      openPanel: () => panel.setState({ open: true }),
      closePanel: () => panel.setState({ open: false }),
    },
    { agent, configured: initialStatus ?? null },
  )

  const chat = new CocoChat(agent, mode, {
    onSubmit: () => panel.setState({ status: 'sending', error: null }),
    onMessages: (messages) => {
      // The first chunk that creates an assistant message means the stream
      // has started — flip from sending → streaming.
      const cur = panel.getState()
      const patch: Parameters<typeof panel.setState>[0] = { messages }
      if (
        cur.status === 'sending' &&
        messages.some((m) => m.role === 'assistant')
      ) {
        patch.status = 'streaming'
      }
      panel.setState(patch)
    },
    onLoading: (isLoading) => {
      const patch: Parameters<typeof panel.setState>[0] = { isLoading }
      if (!isLoading) patch.status = 'idle'
      else if (panel.getState().status === 'idle') patch.status = 'sending'
      panel.setState(patch)
    },
    onError: (error) =>
      panel.setState({
        error,
        status: error ? 'idle' : panel.getState().status,
      }),
  })

  // Initial route + watcher.
  const stopWatch = watchRoute((route) => {
    chat.setRoute(route)
    panel.setState({ route })
  })

  document.body.appendChild(panel.hostElement)

  // Clean up if the host page unloads (mostly defensive; HMR replaces the
  // page rather than running our cleanup).
  window.addEventListener('beforeunload', stopWatch, { once: true })
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      void main()
    },
    { once: true },
  )
} else {
  void main()
}
