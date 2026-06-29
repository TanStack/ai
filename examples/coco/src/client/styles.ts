/**
 * All panel CSS as a single string. We inject this into the Shadow DOM root
 * so it can't bleed into (or be styled by) the host page.
 */
export const PANEL_CSS = `
:host, .root {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    Helvetica, Arial, sans-serif;
  color: #e5e7eb;
  font-size: 14px;
  line-height: 1.4;
}

* {
  box-sizing: border-box;
}

.launcher {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2147483646;
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  border: none;
  background: linear-gradient(135deg, #6d4422, #8a5a2e);
  color: white;
  font-size: 22px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.launcher:hover { filter: brightness(1.1); }
.launcher.hidden { display: none; }
.launcher.busy::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: 9999px;
  border: 2px solid rgba(96,165,250,0.6);
  border-top-color: transparent;
  animation: coco-spin 1s linear infinite;
}
.launcher .launcher-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  background: #34d399;
  border: 2px solid #0f172a;
  animation: coco-pulse 1.2s infinite;
}
@keyframes coco-spin { to { transform: rotate(360deg); } }

.panel {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2147483647;
  width: 420px;
  max-width: calc(100vw - 32px);
  height: 600px;
  max-height: calc(100vh - 32px);
  background: #0f172a;
  border: 1px solid #1f2937;
  border-radius: 12px;
  box-shadow: 0 14px 50px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panel.hidden { display: none; }

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #111827;
  border-bottom: 1px solid #1f2937;
}
.title {
  font-weight: 600;
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.title-emoji { font-size: 16px; }

.select, .btn, .input {
  font: inherit;
  color: inherit;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 4px 8px;
}
.select { padding: 3px 6px; font-size: 12px; }
.btn { cursor: pointer; padding: 4px 8px; font-size: 12px; }
.btn:hover { background: #374151; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.primary { background: #2563eb; border-color: #2563eb; }
.btn.primary:hover { background: #1d4ed8; }
.btn.danger { background: #7f1d1d; border-color: #7f1d1d; }
.btn.active { background: #b45309; border-color: #b45309; }
.btn.icon { padding: 4px 6px; }

.context-bar {
  padding: 6px 10px;
  background: #0b1220;
  border-bottom: 1px solid #1f2937;
  font-size: 11px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.chip {
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 9999px;
  padding: 2px 8px;
  color: #cbd5e1;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
}
.chip code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  color: #e5e7eb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
.chip .x {
  cursor: pointer;
  color: #94a3b8;
  margin-left: 2px;
}
.chip .x:hover { color: #f87171; }

.notice {
  margin: 6px 10px 0;
  padding: 6px 8px;
  background: rgba(180, 83, 9, 0.18);
  border: 1px solid rgba(180, 83, 9, 0.6);
  color: #fde68a;
  border-radius: 6px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.notice .btn {
  padding: 2px 6px;
  font-size: 11px;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.empty {
  color: #64748b;
  font-size: 12px;
  text-align: center;
  margin-top: 24px;
}

.msg {
  max-width: 100%;
}
.msg.user .bubble {
  background: #1d4ed8;
  color: white;
  border-radius: 10px;
  padding: 6px 10px;
  margin-left: auto;
  max-width: 80%;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg.user { display: flex; justify-content: flex-end; }
.msg.assistant { white-space: pre-wrap; word-break: break-word; }
.msg .text { padding: 2px 0; }

.thinking {
  border-left: 2px solid #334155;
  padding-left: 8px;
  color: #94a3b8;
  font-style: italic;
  font-size: 12px;
  margin: 4px 0;
  white-space: pre-wrap;
}

.tool {
  border: 1px solid #1f2937;
  background: rgba(15, 23, 42, 0.7);
  border-radius: 6px;
  margin: 4px 0;
  overflow: hidden;
}
.tool summary {
  cursor: pointer;
  padding: 4px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #fbbf24;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tool summary::-webkit-details-marker { display: none; }
.tool .body { padding: 6px 8px; border-top: 1px solid #1f2937; }
.tool pre {
  background: #020617;
  color: #cbd5e1;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  padding: 6px;
  border-radius: 4px;
  overflow: auto;
  max-height: 180px;
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-all;
}
.tool .state {
  color: #94a3b8;
  font-size: 10.5px;
  margin-left: auto;
}

.thinking-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 9999px;
  background: linear-gradient(135deg, rgba(37,99,235,0.18), rgba(180,83,9,0.18));
  border: 1px solid rgba(96,165,250,0.4);
  color: #e0e7ff;
  font-size: 12px;
  margin-top: 4px;
}
.thinking-pill .label { margin-left: 2px; }
.thinking-pill .dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #93c5fd;
  display: inline-block;
  animation: coco-bounce 1s infinite ease-in-out;
}
.thinking-pill .dot:nth-child(2) { animation-delay: 0.15s; }
.thinking-pill .dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes coco-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
  40% { transform: translateY(-3px); opacity: 1; }
}

.status-bar {
  padding: 4px 10px;
  background: #0b1220;
  border-top: 1px solid #1f2937;
  font-size: 11px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-bar .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #475569;
}
.status-bar.idle .status-dot { background: #475569; }
.status-bar.sending .status-dot { background: #facc15; animation: coco-pulse 1.2s infinite; }
.status-bar.streaming .status-dot { background: #34d399; animation: coco-pulse 1.2s infinite; }
.status-bar.error .status-dot { background: #f87171; }
@keyframes coco-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.error {
  margin: 6px 10px;
  padding: 6px 8px;
  background: rgba(127, 29, 29, 0.4);
  border: 1px solid #7f1d1d;
  color: #fecaca;
  border-radius: 6px;
  font-size: 12px;
}

.composer {
  border-top: 1px solid #1f2937;
  padding: 8px;
  display: flex;
  gap: 6px;
}
.input {
  flex: 1;
  resize: none;
  min-height: 36px;
  max-height: 120px;
  padding: 6px 8px;
}

.setup-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 10;
}
.setup-card {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 14px;
  width: 100%;
  max-width: 360px;
  max-height: 100%;
  overflow: auto;
}
.setup-card h2 { margin: 0 0 6px; font-size: 14px; }
.setup-card p { margin: 0 0 10px; color: #94a3b8; font-size: 12px; }
.setup-card ol { padding-left: 18px; margin: 0 0 10px; }
.setup-card li { margin-bottom: 8px; font-size: 12px; }
.setup-card code, .setup-card pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.setup-card pre {
  background: #020617;
  color: #a7f3d0;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 11px;
  overflow: auto;
  margin-top: 4px;
}
.setup-card .actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.setup-card a {
  color: #60a5fa;
  font-size: 12px;
  text-decoration: none;
}
.setup-card a:hover { text-decoration: underline; }

/* Element picker overlay (lives in the host page, not Shadow DOM) */
`
