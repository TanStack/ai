/**
 * Host React renderer for Tier F (Draft 0.2 §5, §6). Mounts a pinned artifact
 * revision in a sandboxed iframe, runs the host side of the bridge protocol
 * (`createFrameHost`), injects host theme tokens, owns the instance state, and
 * forwards submit/action intents to the host's machinery.
 *
 * Inline-first (§11, Draft 0.1 §1.6): this component renders the frame as
 * message content in the conversation; the standalone page is a separate
 * library surface, not this.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createFrameHost } from '../frame/bridge'
import { FRAME_THEME_TOKEN_NAMES } from '../frame/shell'
import type { IntentDispatch } from '../frame/bridge'
import type {
  ArtifactPin,
  BridgeEnvelope,
  FrameErrorPayload,
  FrameTheme,
} from '../frame/types'

/** Read the host's own `--ui-*` tokens off a DOM node (default theme source, §5.2). */
export function readHostTheme(from?: Element | null): FrameTheme {
  const el =
    from ?? (typeof document !== 'undefined' ? document.documentElement : null)
  const tokens: Record<string, string> = {}
  let mode: 'light' | 'dark' = 'light'
  if (el && typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(el)
    for (const name of FRAME_THEME_TOKEN_NAMES) {
      const v = cs.getPropertyValue(name).trim()
      if (v) tokens[name] = v
    }
    const attr = el.getAttribute('data-theme')
    if (attr === 'dark' || attr === 'light') mode = attr
    else if (el.classList.contains('dark')) mode = 'dark'
  }
  return { mode, tokens }
}

let instanceSeq = 0

/** Normalize a value for MCP Apps `structuredContent` (must be an object). */
function asStructured(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value }
}

export interface FrameArtifactRendererProps {
  pin: ArtifactPin
  /** Build the sandbox-origin URL for this pinned revision (§4.1). */
  sandboxUrl: (pin: ArtifactPin, instanceId: string) => string
  /** Host data passed on host.init (authoritative numbers, §7.3.4). */
  data?: unknown
  /**
   * Live data source for this instance. Called with an `emit` callback; each
   * emission is pushed into the mounted frame over the active bridge (ogui/1
   * `host.data` or MCP Apps `tool-result`) so the view updates in real time.
   * Returns an unsubscribe run on unmount. Host-authoritative, like `data`.
   */
  subscribeData?: (emit: (data: unknown) => void) => () => void
  registryVersion?: string
  /** Theme source; defaults to reading `--ui-*` off the host document (§5.2). */
  getTheme?: () => FrameTheme
  /** Seed instance state (§6.4). */
  initialState?: Record<string, unknown>
  onStateChange?: (state: Record<string, unknown>) => void
  /** Route submit/action intents through the host (§6.3). */
  onIntent?: (
    dispatch: IntentDispatch,
  ) => Promise<{ ok: boolean; result?: unknown; error?: string }> | void
  onError?: (err: FrameErrorPayload) => void
  title?: string
  minHeight?: number
  className?: string
  /** Show the host-owned frame affordance (border/label), §9.2.8. Default true. */
  chrome?: boolean
  /**
   * Bridge protocol. `ogui/1` (default) uses the built-in host bridge; `mcp-app`
   * drives the frame over the standard MCP Apps (SEP-1865) protocol via a
   * lazily-loaded ext-apps `AppBridge` — the shell must serve the ext-apps guest
   * (buildShellDocument `guestScript`).
   */
  protocol?: 'ogui/1' | 'mcp-app'
}

/**
 * Render one artifact instance. Owns a stable `instanceId` and host-side state;
 * the iframe is `sandbox="allow-scripts"` (opaque origin in the single-origin
 * POC — a production host serves from a dedicated sandbox origin, §4.2).
 */
export function FrameArtifactRenderer(props: FrameArtifactRendererProps) {
  const {
    pin,
    sandboxUrl,
    data,
    subscribeData,
    registryVersion,
    getTheme,
    initialState,
    onStateChange,
    onIntent,
    onError,
    title,
    minHeight = 80,
    className,
    chrome = true,
    protocol = 'ogui/1',
  } = props

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const instanceId = useRef<string>(`inst_${++instanceSeq}_${pin.artifactId}`)
  const stateRef = useRef<Record<string, unknown>>({ ...(initialState ?? {}) })
  const themeRef = useRef<() => FrameTheme>(getTheme ?? (() => readHostTheme()))
  themeRef.current = getTheme ?? (() => readHostTheme())

  const [height, setHeight] = useState<number>(minHeight)
  const [errored, setErrored] = useState<FrameErrorPayload | null>(null)

  const url = sandboxUrl(pin, instanceId.current)

  // One host endpoint per mounted instance; stored in a ref so the message
  // listener and theme-push effects share it.
  const hostRef = useRef<ReturnType<typeof createFrameHost> | null>(null)
  // The mcp-app AppBridge (when protocol === 'mcp-app'), promoted to a ref so
  // the live-data effect can push `sendToolResult` after the connect effect ran.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ext-apps is dynamically imported
  const bridgeRef = useRef<any>(null)
  // Latest live value, buffered until the mcp-app bridge is initialized
  // (sendToolResult requires post-init); flushed from `oninitialized`.
  const liveDataRef = useRef<{ has: boolean; value: unknown }>({
    has: false,
    value: undefined,
  })
  const bridgeInitRef = useRef<boolean>(false)

  const send = useCallback((env: BridgeEnvelope) => {
    // Opaque frame origin can't be named → targetOrigin '*'. Safe: we control
    // the frame src + sandbox (blocks top-nav/popups), §4.2 / Draft 0.1 findings.
    iframeRef.current?.contentWindow?.postMessage(env, '*')
  }, [])

  useEffect(() => {
    if (protocol === 'mcp-app') return
    const host = createFrameHost(
      { artifactId: pin.artifactId, instanceId: instanceId.current },
      {
        getTheme: () => themeRef.current(),
        getState: () => stateRef.current,
        setState: (next) => {
          stateRef.current = next
          onStateChange?.(next)
        },
        getData: () => data,
        registryVersion,
        onIntent: onIntent,
        onResize: (h) => setHeight(Math.max(minHeight, h)),
        onError: (err) => {
          setErrored(err)
          onError?.(err)
        },
        send,
      },
    )
    hostRef.current = host

    const onMessage = (ev: MessageEvent) => {
      // Trust only this instance's frame; opaque origin shows as "null".
      if (ev.source !== iframeRef.current?.contentWindow) return
      void host.handleMessage(ev.data)
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      hostRef.current = null
    }
    // Re-create when the pinned revision changes (a new frame mounts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin.artifactId, pin.revision, url])

  // Push theme updates when the host theme changes (e.g. light/dark toggle).
  useLayoutEffect(() => {
    hostRef.current?.pushTheme(themeRef.current())
  })

  // MCP Apps (SEP-1865) host: drive the frame over the standard protocol via
  // ext-apps `AppBridge`, connected directly to our iframe. ext-apps is lazily
  // imported so the base renderer bundle stays free of it.
  useEffect(() => {
    if (protocol !== 'mcp-app') return
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ext-apps is dynamically imported
    let bridge: any = null
    void (async () => {
      // Host AppBridge lives on the `/app-bridge` subpath; PostMessageTransport
      // on the root. (ext-apps `.` is the guest `App`.)
      const [bridgeMod, rootMod]: [any, any] = await Promise.all([
        import('@modelcontextprotocol/ext-apps/app-bridge'),
        import('@modelcontextprotocol/ext-apps'),
      ])
      if (cancelled) return
      const mod: any = {
        AppBridge: bridgeMod.AppBridge,
        PostMessageTransport: rootMod.PostMessageTransport,
      }
      const theme = themeRef.current()
      const bridgeInstance = new mod.AppBridge(
        null,
        { name: 'generative-ui-host', version: '0.2.0' },
        { openLinks: {} },
        {
          hostContext: {
            theme: theme.mode,
            styles: { variables: theme.tokens },
          },
        },
      )
      bridge = bridgeInstance
      bridgeRef.current = bridgeInstance
      bridgeInstance.oncalltool = async (params: any) => {
        const outcome = await onIntent?.({
          intentClass: 'action',
          intent: params.name,
          payload: params.arguments,
          state: stateRef.current,
        })
        const result = outcome?.result ?? {}
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent:
            result && typeof result === 'object' ? result : undefined,
        }
      }
      bridgeInstance.onmessage = async ({ content }: any) => {
        const text = (content ?? [])
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('')
        void onIntent?.({
          intentClass: 'submit',
          intent: 'message',
          payload: text,
          state: stateRef.current,
        })
        return {}
      }
      bridgeInstance.onopenlink = async ({ url }: any) => {
        try {
          window.open(url, '_blank', 'noopener,noreferrer')
        } catch {}
        return {}
      }
      bridgeInstance.onupdatemodelcontext = async (params: any) => {
        if (
          params?.structuredContent &&
          typeof params.structuredContent === 'object'
        ) {
          stateRef.current = params.structuredContent
          onStateChange?.(stateRef.current)
        }
        return {}
      }
      bridgeInstance.onsizechange = (params: any) => {
        if (typeof params?.height === 'number')
          setHeight(Math.max(minHeight, params.height))
      }
      bridgeInstance.oninitialized = () => {
        bridgeInitRef.current = true
        if (data !== undefined) {
          const args =
            data && typeof data === 'object' && !Array.isArray(data)
              ? (data as Record<string, unknown>)
              : { value: data }
          try {
            void bridgeInstance.sendToolInput({ arguments: args })
          } catch {}
        }
        // Flush any live value that arrived before the bridge was ready
        // (sendToolResult is only valid after initialized — ext-apps contract).
        if (liveDataRef.current.has) {
          try {
            void bridgeInstance.sendToolResult({
              structuredContent: asStructured(liveDataRef.current.value),
            })
          } catch {}
        }
      }
      const iframe = iframeRef.current
      if (!iframe?.contentWindow || cancelled) return
      try {
        await bridgeInstance.connect(
          new mod.PostMessageTransport(
            iframe.contentWindow,
            iframe.contentWindow,
          ),
        )
      } catch (err) {
        onError?.({ message: `MCP Apps bridge failed: ${String(err)}` })
      }
    })()
    return () => {
      cancelled = true
      bridgeRef.current = null
      bridgeInitRef.current = false
      try {
        bridge?.close?.()
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin.artifactId, pin.revision, url, protocol])

  // Push one value into the mounted frame over whichever bridge is active. For
  // mcp-app the bridge must be initialized first (ext-apps contract), so buffer
  // until `oninitialized` flushes it.
  const pushLive = useCallback(
    (value: unknown) => {
      if (protocol === 'mcp-app') {
        liveDataRef.current = { has: true, value }
        if (bridgeInitRef.current && bridgeRef.current) {
          try {
            void bridgeRef.current.sendToolResult({
              structuredContent: asStructured(value),
            })
          } catch {}
        }
      } else {
        hostRef.current?.pushData(value)
      }
    },
    [protocol],
  )

  // Live data source: subscribe on mount, push each emission into the frame,
  // unsubscribe on unmount. This is what makes an iframe'd view update in real
  // time — the guest's useHostData()/onData re-renders on every push.
  useEffect(() => {
    if (!subscribeData) return
    const unsubscribe = subscribeData((value) => pushLive(value))
    return () => {
      try {
        unsubscribe?.()
      } catch {}
    }
    // Re-subscribe when the frame remounts (new revision) or the source changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin.artifactId, pin.revision, url, subscribeData, pushLive])

  // Re-push the static `data` prop when it changes after mount (the one-shot
  // snapshot otherwise only delivered on host.init / first sendToolInput).
  const dataPushedRef = useRef<boolean>(false)
  useEffect(() => {
    if (data === undefined) return
    // Skip the very first run: host.init (ogui/1) / sendToolInput (mcp-app)
    // already carry the initial value; only re-push on subsequent changes.
    if (!dataPushedRef.current) {
      dataPushedRef.current = true
      return
    }
    pushLive(data)
  }, [data, pushLive])

  return (
    <div
      className={className}
      style={
        chrome
          ? {
              border: '1px solid var(--gui-border, var(--ui-border, #e5e7eb))',
              borderRadius: 12,
              overflow: 'hidden',
              background: 'var(--gui-surface, var(--ui-surface, #fff))',
            }
          : undefined
      }
    >
      {chrome && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--gui-text-muted, var(--ui-muted, #6b7280))',
            borderBottom:
              '1px solid var(--gui-border, var(--ui-border, #eef2f7))',
          }}
        >
          <span aria-hidden>▢</span>
          <span>{title ?? 'Generated view'}</span>
          <span style={{ marginLeft: 'auto', opacity: 0.7 }}>sandboxed</span>
        </div>
      )}
      {errored && (
        <div
          style={{
            padding: '10px 12px',
            fontSize: 13,
            color: 'var(--gui-danger, var(--ui-negative, #dc2626))',
          }}
        >
          This view failed to render. {errored.message}
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={url}
        title={title ?? 'Generated artifact'}
        sandbox="allow-scripts"
        style={{ display: 'block', width: '100%', height, border: 0 }}
      />
    </div>
  )
}
