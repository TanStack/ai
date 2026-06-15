/**
 * Coco panel entry point — runs in the user's page after the proxy injects
 * `<script src="/__coco/client.js">`. Mounts the Shadow-DOM panel, wires it
 * to a `ChatClient` (talking to `/__coco/api/chat`), tracks the current
 * route, and powers the click-to-select element picker.
 */
import { Panel, type AgentConfigMap } from './panel.ts'
import { CocoChat } from './chat.ts'
import {
  pickElement,
  watchRoute,
  type ElementPickerHandle,
  type SelectedElement,
} from './context.ts'
import { DEFAULT_AGENT, type AgentId, type AgentMode } from '../agents.ts'

const MOUNT_FLAG = '__coco_mounted__'

const fetchAgentConfig = async (): Promise<AgentConfigMap> => {
  try {
    const res = await fetch('/__coco/api/agents', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as AgentConfigMap
  } catch {
    return {
      'claude-code': false,
      codex: false,
      'gemini-cli': false,
      opencode: false,
    }
  }
}

const main = () => {
  const w = window as unknown as Record<string, unknown>
  if (w[MOUNT_FLAG]) return
  w[MOUNT_FLAG] = true

  let picker: ElementPickerHandle | null = null

  let agent: AgentId = DEFAULT_AGENT
  let mode: AgentMode = 'edit'

  const panel = new Panel({
    send: (text) => {
      const isConfigured = panel.getState().configured[agent]
      if (!isConfigured) {
        panel.setState({ setupOpen: agent })
        return
      }
      chat.send(text)
    },
    newSession: () => {
      chat.clear()
      panel.setState({ error: null })
    },
    selectAgent: (id) => {
      agent = id
      chat.setAgent(id)
      const configured = panel.getState().configured[id]
      panel.setState({ agent: id, setupOpen: configured ? null : id })
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
  })

  const chat = new CocoChat(agent, mode, {
    onMessages: (messages) => panel.setState({ messages }),
    onLoading: (isLoading) => panel.setState({ isLoading }),
    onError: (error) => panel.setState({ error }),
  })

  // Initial route + watcher.
  const stopWatch = watchRoute((route) => {
    chat.setRoute(route)
    panel.setState({ route })
  })

  // Fetch agent-config from the server and surface it in the panel.
  void fetchAgentConfig().then((configured) => panel.setState({ configured }))

  document.body.appendChild(panel.hostElement)

  // Clean up if the host page unloads (mostly defensive; HMR replaces the
  // page rather than running our cleanup).
  window.addEventListener('beforeunload', stopWatch, { once: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true })
} else {
  main()
}
