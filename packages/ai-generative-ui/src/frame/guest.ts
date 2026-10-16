/**
 * MCP-Apps-native guest adapter for `html-fragment` artifacts (Draft 0.2 / SEP-1865).
 *
 * Source for a self-contained script the host bundles (ext-apps + this adapter)
 * and inlines ahead of a fragment's own markup. It stands up the official
 * ext-apps `App` over `PostMessageTransport(window.parent, window)` and exposes
 * the SAME `window.__ogui` API our fragments already use — so existing fragments
 * work unchanged, now speaking the real MCP Apps bridge:
 *
 * - `setState` → `ui/update-model-context` (host-visible) + local for render.
 * - `emitIntent` action → `tools/call`; submit → `ui/message`.
 * - `onData`/`getData` ← `ui/notifications/tool-input` / `…/tool-result`.
 * - `getTheme`/`onTheme` ← host `styles.variables` (applied to `:root`).
 * - size: `setupSizeChangedNotifications()` auto-emits `ui/notifications/size-changed`
 *   so the host sizes the iframe to content.
 *
 * Bundled with `format: 'iife'` so it runs synchronously (classic script) and
 * `window.__ogui` exists before the fragment's inline script runs.
 */
export const FRAGMENT_GUEST_SOURCE = /* js */ `
import { App, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';

(function () {
  var app = new App({ name: 'ogui-fragment', version: '0.2.0' }, {});
  var state = {};
  var data;
  var theme;
  var ready = false;
  var subs = { state: [], data: [], theme: [], ready: [] };
  function fire(kind, value) { (subs[kind] || []).forEach(function (cb) { try { cb(value); } catch (e) {} }); }
  function on(kind, cb) { (subs[kind] = subs[kind] || []).push(cb); return function () { var a = subs[kind], i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); }; }
  function applyTheme(ctx) {
    if (ctx && ctx.styles && ctx.styles.variables) { try { applyHostStyleVariables(ctx.styles.variables); } catch (e) {} }
    if (ctx && ctx.theme) { try { document.documentElement.setAttribute('data-theme', ctx.theme); } catch (e) {} }
    theme = ctx; fire('theme', theme);
  }

  app.ontoolinput = function (p) { data = (p && p.arguments) || data; fire('data', data); };
  app.ontoolresult = function (p) { data = (p && p.structuredContent) || data; fire('data', data); };
  app.onhostcontextchanged = function (p) { applyTheme(p); };

  window.__ogui = {
    getState: function () { return state; },
    setState: function (next) {
      state = typeof next === 'function' ? next(state) : Object.assign({}, state, next);
      fire('state', state);
      try { app.updateModelContext({ structuredContent: state }); } catch (e) {}
    },
    getData: function () { return data; },
    getTheme: function () { return theme; },
    onState: function (cb) { return on('state', cb); },
    onData: function (cb) { return on('data', cb); },
    onTheme: function (cb) { return on('theme', cb); },
    onReady: function (cb) { if (ready) { try { cb(); } catch (e) {} } return on('ready', cb); },
    emitIntent: function (intent, payload, opts) {
      opts = opts || {};
      if (opts.intentClass === 'action') {
        var pr = app.callServerTool({ name: intent, arguments: payload || {} });
        return pr && pr.then
          ? pr.then(function (r) { return { ok: true, result: (r && r.structuredContent) || r }; }).catch(function (e) { return { ok: false, error: String(e) }; })
          : undefined;
      }
      try { app.sendMessage({ role: 'user', content: [{ type: 'text', text: JSON.stringify({ intent: intent, payload: payload }) }] }); } catch (e) {}
      return undefined;
    }
  };

  (async function () {
    try {
      // No explicit transport: App auto-wires the correct PostMessage channel
      // for the @mcp-ui/client sandbox-proxy environment.
      await app.connect();
      if (app.getHostContext) applyTheme(app.getHostContext());
      if (app.setupSizeChangedNotifications) app.setupSizeChangedNotifications();
      ready = true;
      fire('ready'); fire('data', data); fire('state', state);
    } catch (e) {
      // No MCP Apps host present (e.g. opened standalone) — __ogui still works
      // locally so the fragment renders and interacts in-frame.
    }
  })();
})();
`
