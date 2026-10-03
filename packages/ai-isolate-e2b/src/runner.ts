/**
 * The program that runs inside the sandbox: one `node` process per
 * `execute`. Generated code awaits real tool calls: a request goes out on
 * stdout, the host answers on stdin, and the code continues where it
 * stopped. Nothing is replayed.
 *
 * Protocol lines on stdout start with a per-execution marker; everything else
 * is ignored. The marker keeps ordinary output from being read as protocol.
 * It is not a security boundary: code in the sandbox can reach the same
 * stdout, so the host validates every message.
 */

export type RunnerMessage =
  | { type: 'log'; line: string }
  | { type: 'tool'; id: string; name: string; args: unknown }
  | { type: 'done'; success: true; value?: unknown }
  | {
      type: 'done'
      success: false
      error: { name: string; message: string; stack?: string }
    }

export type ToolReply =
  | { id: string; success: true; value?: unknown }
  | { id: string; success: false; error: string }

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

export function runnerSource(
  code: string,
  toolNames: Array<string>,
  marker: string,
): string {
  for (const name of toolNames) {
    if (!IDENTIFIER.test(name)) {
      throw new Error(`Invalid tool name '${name}': must be a JS identifier`)
    }
  }
  // Code and names travel as JSON literals, so nothing needs escaping.
  return `'use strict';
try { require('node:fs').unlinkSync(__filename) } catch {}
const __marker = ${JSON.stringify(marker)};
const __out = process.stdout.write.bind(process.stdout);
// A leading newline keeps a protocol line whole after raw writes without one.
const __send = (m) => __out('\\n' + __marker + JSON.stringify(m) + '\\n');
const __norm = (e) => {
  if (e instanceof Error) return { name: e.name || 'Error', message: e.message || String(e), stack: e.stack };
  if (e && typeof e === 'object') {
    const s = (k) => { try { return typeof e[k] === 'string' ? e[k] : undefined } catch { return undefined } };
    return { name: s('name') || 'Error', message: s('message') || 'Error' };
  }
  return { name: 'Error', message: String(e) };
};
const __fmt = (a) => {
  if (typeof a === 'string') return a;
  try { const j = JSON.stringify(a); if (j !== undefined) return j } catch {}
  try { return String(a) } catch { return '[Unserializable]' }
};
const __log = (prefix) => (...args) => __send({ type: 'log', line: prefix + args.map(__fmt).join(' ') });
globalThis.console = { log: __log(''), info: __log('INFO: '), warn: __log('WARN: '), error: __log('ERROR: '), debug: __log('') };

const __pending = new Map();
let __next = 0;
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line) } catch { return }
  const p = __pending.get(m.id);
  if (!p) return;
  __pending.delete(m.id);
  if (m.success) p.resolve(m.value); else p.reject(new Error(m.error || 'Tool call failed'));
});
const __tool = (name) => (args) => new Promise((resolve, reject) => {
  const id = 'tc_' + __next++;
  __pending.set(id, { resolve, reject });
  __send({ type: 'tool', id, name, args });
});

const __finish = (m) => {
  let line;
  try { line = '\\n' + __marker + JSON.stringify(m) + '\\n' }
  catch (e) { line = '\\n' + __marker + JSON.stringify({ type: 'done', success: false, error: __norm(e) }) + '\\n' }
  // Pipes are asynchronous on some platforms: exit only once the line is flushed.
  // The host then kills the process group, including anything the code spawned.
  __out(line, () => process.exit(0));
};
const __names = ${JSON.stringify(toolNames)};
(async () => {
  const AsyncFunction = (async () => {}).constructor;
  const fn = new AsyncFunction(...__names, ${JSON.stringify(code)});
  return fn(...__names.map(__tool));
})().then(
  (value) => __finish({ type: 'done', success: true, value }),
  (error) => __finish({ type: 'done', success: false, error: __norm(error) }),
);
`
}
