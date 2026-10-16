/**
 * The shell contract (Draft 0.2 §5) and the serving CSP (§4.3).
 *
 * The shell is host-authored and host-versioned: the model never writes it, and
 * stored artifacts never contain it, so bridge/theme/security fixes ship to
 * every existing artifact without regeneration (§5). This module generates the
 * shell document, the frame-side bridge client, and the `@ogui/bridge` runtime
 * module — all host runtime, served from the sandbox origin.
 */

import { FRAME_PROTOCOL } from './types'
import { SHELL_VERSION as SHELL_VERSION_VALUE } from './bridge'
import type { ArtifactRecord, FrameTheme, ModuleRegistry } from './types'

/**
 * Canonical semantic theme token names the shell projects onto the frame
 * `:root` (§5.2). Names are the host's choice; these are the reference set.
 */
export const FRAME_THEME_TOKEN_NAMES = [
  '--ui-bg',
  '--ui-surface',
  '--ui-surface-2',
  '--ui-text',
  '--ui-muted',
  '--ui-border',
  '--ui-accent',
  '--ui-accent-text',
  '--ui-positive',
  '--ui-negative',
  '--ui-radius',
] as const

/* -------------------------------------------------------------------------- */
/* CSP (§4.3)                                                                 */
/* -------------------------------------------------------------------------- */

export interface CspOptions {
  kind: ArtifactRecord['kind']
  /** App origin allowed to frame the sandbox (`frame-ancestors`). */
  appOrigin: string
  /** Per-revision granted connect-src domains (§9.3); default none. */
  connectGrants?: Array<string>
  /** Nonce for react-tsx shell scripts (strict script-src, §7.3.3). */
  nonce?: string
}

/**
 * Build the sandbox-route CSP (§4.3). react-tsx gets the strict
 * `script-src 'self' 'nonce-…'` the spec advertises (all scripts are the
 * external built bundle or nonce'd shell bootstrap — no eval, §7.3.3).
 * html-fragment relaxes to `'unsafe-inline'` because the model's own inline
 * `<script>` must run (§7.1) and its content is unknown at serve time.
 */
export function buildCsp(opts: CspOptions): string {
  const connect = opts.connectGrants && opts.connectGrants.length ? opts.connectGrants.join(' ') : "'none'"
  // Single-origin POC: a sandboxed iframe (allow-scripts, no allow-same-origin)
  // has an opaque origin, so `'self'` matches nothing and would block the
  // built bundle + runtime modules. Allow the serving origin explicitly. A
  // production host serves `/sandbox/*` from a dedicated origin where `'self'`
  // is the sandbox origin and this extra source is unnecessary (§4.2, §4.3).
  const scriptSrc =
    opts.kind === 'react-tsx'
      ? `script-src 'self' ${opts.appOrigin}${opts.nonce ? ` 'nonce-${opts.nonce}'` : ''}`
      : `script-src 'self' 'unsafe-inline'`
  return [
    `default-src 'none'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https:`,
    `font-src 'self' data:`,
    `connect-src ${connect}`,
    `frame-ancestors ${opts.appOrigin}`,
    `base-uri 'none'`,
    `form-action 'none'`,
  ].join('; ')
}

/* -------------------------------------------------------------------------- */
/* Frame-side bridge client (§5.1, §6) — runs inside the sandbox             */
/* -------------------------------------------------------------------------- */

/**
 * The frame-side bridge client. Plain, eval-free JS. Exposes `window.__ogui`
 * (getState/setState/onState/emitIntent/getTheme/…) for html-fragment scripts
 * and the `@ogui/bridge` React module; wires `postMessage` to the §6 envelope;
 * reports size via ResizeObserver and errors via window.onerror.
 *
 * Placeholders are replaced at shell-build time.
 */
const BRIDGE_CLIENT_TEMPLATE = /* js */ `
(function () {
  var NS = '__NS__';
  var ARTIFACT_ID = '__ARTIFACT_ID__';
  var INSTANCE_ID = '__INSTANCE_ID__';
  var APP_ORIGIN = '__APP_ORIGIN__';

  var state = {};
  var theme = { mode: 'light', tokens: {} };
  var data = undefined;
  var reqSeq = 0;
  var pending = {};
  var listeners = { state: [], theme: [], data: [], ready: [] };
  var ready = false;

  function post(type, payload, requestId) {
    var env = { ns: NS, type: type, artifactId: ARTIFACT_ID, instanceId: INSTANCE_ID, payload: payload || {} };
    if (requestId) env.requestId = requestId;
    parent.postMessage(env, APP_ORIGIN);
  }

  function applyTheme(t) {
    theme = t || theme;
    try {
      var root = document.documentElement;
      root.setAttribute('data-theme', theme.mode || 'light');
      var tokens = theme.tokens || {};
      for (var k in tokens) {
        if (Object.prototype.hasOwnProperty.call(tokens, k)) root.style.setProperty(k, tokens[k]);
      }
    } catch (e) {}
    fire('theme', theme);
  }

  function fire(kind, value) {
    var ls = listeners[kind] || [];
    for (var i = 0; i < ls.length; i++) { try { ls[i](value); } catch (e) {} }
  }

  function on(kind, cb) {
    (listeners[kind] = listeners[kind] || []).push(cb);
    return function () {
      var ls = listeners[kind]; var idx = ls.indexOf(cb); if (idx >= 0) ls.splice(idx, 1);
    };
  }

  window.addEventListener('message', function (ev) {
    if (ev.origin !== APP_ORIGIN) return;
    var m = ev.data;
    if (!m || m.ns !== NS || m.artifactId !== ARTIFACT_ID || m.instanceId !== INSTANCE_ID) return;
    switch (m.type) {
      case 'host.init':
        state = (m.payload && m.payload.state) || {};
        data = m.payload && m.payload.data;
        applyTheme(m.payload && m.payload.theme);
        if (!ready) { ready = true; fire('ready', undefined); }
        fire('state', state); fire('data', data);
        break;
      case 'host.theme':
        applyTheme(m.payload && m.payload.theme); break;
      case 'host.state':
        state = (m.payload && m.payload.state) || {}; fire('state', state); break;
      case 'host.data':
        data = m.payload && m.payload.data; fire('data', data); break;
      case 'host.intent.result':
        var rid = m.payload && m.payload.requestId;
        if (rid && pending[rid]) { pending[rid](m.payload); delete pending[rid]; }
        break;
    }
  });

  var api = {
    getState: function () { return state; },
    setState: function (next) {
      var value = typeof next === 'function' ? next(state) : next;
      state = value && typeof value === 'object' ? value : state;
      post('frame.state.set', { state: state });
      fire('state', state);
    },
    getData: function () { return data; },
    getTheme: function () { return theme; },
    onState: function (cb) { return on('state', cb); },
    onData: function (cb) { return on('data', cb); },
    onTheme: function (cb) { return on('theme', cb); },
    onReady: function (cb) { if (ready) { try { cb(); } catch (e) {} } return on('ready', cb); },
    emitIntent: function (intent, payload, opts) {
      opts = opts || {};
      var cls = opts.intentClass === 'action' ? 'frame.intent.action' : 'frame.intent.submit';
      if (opts.expectResult) {
        var rid = 'req_' + (++reqSeq);
        var p = new Promise(function (resolve) { pending[rid] = resolve; });
        post(cls, { intent: intent, payload: payload, state: state }, rid);
        return p;
      }
      post(cls, { intent: intent, payload: payload, state: state });
      return undefined;
    }
  };
  window.__ogui = api;

  function reportSize() {
    var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 0);
    if (h > 0) post('frame.resize', { height: h });
  }
  if (typeof ResizeObserver !== 'undefined') {
    try { new ResizeObserver(reportSize).observe(document.documentElement); } catch (e) {}
  }
  window.addEventListener('load', reportSize);
  window.addEventListener('error', function (ev) {
    post('frame.error', { message: (ev && ev.message) || 'error', stack: ev && ev.error && ev.error.stack });
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    post('frame.error', { message: (r && r.message) || String(r) });
  });

  // Announce readiness; the host answers with host.init.
  post('frame.ready', { kind: '__KIND__', shellVersion: '__SHELL_VERSION__' });
})();
`

/* -------------------------------------------------------------------------- */
/* The @ogui/bridge runtime module (§7.3.2) — imported by react-tsx          */
/* -------------------------------------------------------------------------- */

/**
 * Source of the `@ogui/bridge` registry module: the §6 bridge surfaced as React
 * hooks over `window.__ogui`. Served from the runtime route; imported by
 * react-tsx artifacts. Depends only on `react` (also in the registry).
 */
export const OGUI_BRIDGE_MODULE_SOURCE = /* js */ `
import { useCallback, useSyncExternalStore } from 'react';
var bridge = window.__ogui;

export function useHostState(defaults) {
  var state = useSyncExternalStore(bridge.onState, bridge.getState, bridge.getState);
  var setState = useCallback(function (next) {
    var cur = bridge.getState();
    var value = typeof next === 'function' ? next(cur) : next;
    bridge.setState(Object.assign({}, cur, value));
  }, []);
  var merged = Object.assign({}, defaults || {}, state || {});
  return [merged, setState];
}

export function useIntent() {
  return useCallback(function (intent, payload, opts) {
    return bridge.emitIntent(intent, payload, opts);
  }, []);
}

export function useTheme() {
  return useSyncExternalStore(bridge.onTheme, bridge.getTheme, bridge.getTheme);
}

export function useHostData() {
  return useSyncExternalStore(bridge.onData, bridge.getData, bridge.getData);
}
`

/* -------------------------------------------------------------------------- */
/* Shell document (§5.1)                                                      */
/* -------------------------------------------------------------------------- */

export interface ShellOptions {
  record: ArtifactRecord
  instanceId: string
  appOrigin: string
  /** Initial theme (also delivered over the bridge on host.init). */
  theme: FrameTheme
  /** For react-tsx: URL of the built bundle (default export is the component). */
  builtUrl?: string
  /** For react-tsx: registry used to build the import map. */
  registry?: ModuleRegistry
  /** Props passed to the react-tsx component (JSON-serialisable) — e.g. `data`. */
  props?: unknown
  /** Nonce for strict react-tsx CSP. Generated by the host per response. */
  nonce?: string
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function themeStyle(theme: FrameTheme): string {
  const decls = Object.entries(theme.tokens)
    .map(([k, v]) => `${k}:${v};`)
    .join('')
  return `:root{${decls}}`
}

function bridgeClient(record: ArtifactRecord, instanceId: string, appOrigin: string): string {
  return BRIDGE_CLIENT_TEMPLATE.replace(/__NS__/g, FRAME_PROTOCOL)
    .replace(/__ARTIFACT_ID__/g, record.artifactId)
    .replace(/__INSTANCE_ID__/g, instanceId)
    .replace(/__APP_ORIGIN__/g, appOrigin)
    .replace(/__KIND__/g, record.kind)
    .replace(/__SHELL_VERSION__/g, SHELL_VERSION_VALUE)
}

const BASE_STYLE = /* css */ `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0}
body{background:var(--ui-bg,transparent);color:var(--ui-text,#111);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
#root{padding:0}
.ogui-error{margin:12px;padding:12px 14px;border:1px solid var(--ui-border,#e5e7eb);border-radius:var(--ui-radius,10px);background:var(--ui-surface,#fff);color:var(--ui-text,#111)}
.ogui-error h3{margin:0 0 6px;font-size:13px}
.ogui-error p{margin:0;color:var(--ui-muted,#6b7280);font-size:13px}
`

/**
 * A minimal SELF-CONTAINED document for an `html-fragment` artifact — theme
 * tokens + base style + the authored fragment, with no CSP `<meta>` and no
 * `ogui/1` bridge client. This is the form delivered as a `ui://` resource's
 * `text` for the MCP Apps path (SEP-1865): the host's sandbox proxy owns the
 * CSP and the MCP Apps bridge, so the document must not impose its own. Local
 * interactivity in the fragment still works; host round-trips arrive once the
 * fragment speaks the MCP Apps guest protocol.
 */
export function buildFragmentDocument(record: ArtifactRecord, theme?: FrameTheme): string {
  const themeCss = theme ? themeStyle(theme) : ''
  // Center the authored content; the host iframe sizes it (true content-height
  // arrives once the fragment sends MCP Apps `ui/notifications/size-changed`).
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(record.title)}</title>
<style>${BASE_STYLE}body{display:flex;justify-content:center;padding:14px}#root{width:100%;max-width:420px}${themeCss}</style>
</head><body>
<div id="root">${record.source}</div>
</body></html>`
}

/**
 * Build the complete shell document for one pinned revision (§5.1). The model
 * authored only `record.source`; everything structural — skeleton, bridge,
 * theme, error boundary, (for react-tsx) the import map and `createRoot`
 * bootstrap — is host code here.
 */
export function buildShellDocument(opts: ShellOptions): string {
  const { record, instanceId, appOrigin, theme } = opts
  const nonceAttr = record.kind === 'react-tsx' && opts.nonce ? ` nonce="${opts.nonce}"` : ''
  const csp = buildCsp({
    kind: record.kind,
    appOrigin,
    connectGrants: record.networkGrants,
    nonce: opts.nonce,
  })
  const client = bridgeClient(record, instanceId, appOrigin)
  const fallback = escapeHtml(record.fallbackText || record.title)

  const head = `<!doctype html><html lang="en" data-theme="${theme.mode}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${escapeHtml(record.title)}</title>
<style>${BASE_STYLE}${themeStyle(theme)}</style>`

  if (record.kind === 'html-fragment') {
    // The shell completes the document; the model wrote only the fragment.
    return `${head}</head><body>
<div id="root">${record.source}</div>
<noscript><div class="ogui-error"><p>${fallback}</p></div></noscript>
<script>${client}</script>
</body></html>`
  }

  // react-tsx: import map → runtime modules, shell-owned bootstrap behind an
  // error boundary (the model wrote a component, never a createRoot, §7.3.1).
  const registry = opts.registry
  const imports: Record<string, string> = {}
  if (registry) for (const m of registry.modules) imports[m.name] = m.url
  const importMap = JSON.stringify({ imports }, null, 2)
  const propsJson = JSON.stringify(opts.props ?? {})
  const builtUrl = opts.builtUrl ?? ''

  const bootstrap = /* js */ `
import React from 'react';
import { createRoot } from 'react-dom';
import Artifact from ${JSON.stringify(builtUrl)};

var PROPS = ${propsJson};

function ErrorCard(props) {
  return React.createElement('div', { className: 'ogui-error' },
    React.createElement('h3', null, 'This view could not render'),
    React.createElement('p', null, ${JSON.stringify(record.fallbackText || record.title)}));
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error: error }; }
  componentDidCatch(error) {
    try { window.dispatchEvent(new ErrorEvent('error', { message: String(error && error.message || error), error: error })); } catch (e) {}
  }
  render() { return this.state.error ? React.createElement(ErrorCard) : this.props.children; }
}

try {
  var root = createRoot(document.getElementById('root'));
  root.render(React.createElement(Boundary, null, React.createElement(Artifact, PROPS)));
} catch (e) {
  var el = document.getElementById('root');
  if (el) el.innerHTML = '<div class="ogui-error"><p>' + ${JSON.stringify(fallback)} + '</p></div>';
}
`

  return `${head}
<script type="importmap"${nonceAttr}>${importMap}</script>
</head><body>
<div id="root"></div>
<noscript><div class="ogui-error"><p>${fallback}</p></div></noscript>
<script${nonceAttr}>${client}</script>
<script type="module"${nonceAttr}>${bootstrap}</script>
</body></html>`
}
