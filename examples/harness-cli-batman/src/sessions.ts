import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logMessageStore } from "@tanstack/ai-harness";
import { LogConflictError, defineLogStore, defineMetadataStore } from "@tanstack/ai-persistence";
import { SAVE_DIR, jsonFile } from "./credentials";
import type { ModelMessage } from "@tanstack/ai";
import type { LogRecord } from "@tanstack/ai-persistence";

/** One file for each session, in your home folder. */
const SESSIONS_DIR = join(SAVE_DIR, "sessions");
const fileOf = (threadId: string) => join(SESSIONS_DIR, `${encodeURIComponent(threadId)}.jsonl`);

/**
 * The records of a session file. Each line is one batch of records. A crash
 * while a line is written leaves a cut last line: it is removed with its
 * batch, so a batch is in the file in full or not at all.
 */
async function readLog(file: string) {
  const text = await readFile(file, "utf8").catch(() => "");
  const lines = text.split("\n").filter((line) => line !== "");
  const records: Array<LogRecord> = [];
  for (const [index, line] of lines.entries()) {
    try {
      records.push(...(JSON.parse(line) as Array<LogRecord>));
    } catch (error) {
      if (index < lines.length - 1) throw error;
      await writeFile(file, lines.slice(0, -1).join("\n") + "\n");
    }
  }
  return records;
}

/**
 * The session log, in files: the transcript, the inputs, and the events of
 * each session, so a session survives a restart. It keeps each session in
 * memory after the first read.
 * ponytail: for one process. Two CLIs on one session need a store with
 * locks, for example a database.
 */
function fileLog() {
  const loaded = new Map<string, Promise<Array<LogRecord>>>();
  const listeners = new Map<string, Set<() => void>>();
  let appending = Promise.resolve();
  const load = (threadId: string) => {
    let log = loaded.get(threadId);
    if (!log) {
      log = readLog(fileOf(threadId));
      loaded.set(threadId, log);
    }
    return log;
  };
  return defineLogStore({
    append: (threadId, seq, records) => {
      const run = appending.then(async () => {
        if (records.length === 0) return;
        const log = await load(threadId);
        if (seq !== log.length + 1) throw new LogConflictError(threadId, seq);
        const line = JSON.stringify(records);
        await mkdir(SESSIONS_DIR, { recursive: true });
        await appendFile(fileOf(threadId), `${line}\n`);
        log.push(...(JSON.parse(line) as Array<LogRecord>));
        for (const listener of [...(listeners.get(threadId) ?? [])]) {
          listener();
        }
      });
      appending = run.catch(() => {});
      return run;
    },
    read: async (threadId, options = {}) => {
      const log = await load(threadId);
      const after = options.after ?? 0;
      const end = options.limit === undefined ? log.length : after + options.limit;
      return log.slice(after, end).map((record, index) => ({
        seq: after + index + 1,
        record: structuredClone(record),
      }));
    },
    subscribe: (threadId, listener) => {
      const set = listeners.get(threadId) ?? new Set();
      listeners.set(threadId, set);
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
  });
}

/** Each session's settings and plugin state (the model, the todos), in a file. */
function fileMetadata() {
  const { load, update } = jsonFile<unknown>(join(SAVE_DIR, "metadata.json"));
  return defineMetadataStore({
    get: async (namespace, key) => structuredClone((await load())[namespace]?.[key] ?? null),
    set: (namespace, key, value) =>
      update((all) => {
        all[namespace] = { ...all[namespace], [key]: value };
      }),
    delete: (namespace, key) =>
      update((all) => {
        delete all[namespace]?.[key];
      }),
  });
}

export const sessionLog = fileLog();
export const sessionMetadata = fileMetadata();

/** A new session id: short, so it is easy to type after `--resume`. */
export const newSessionId = () => randomUUID().slice(0, 8);

/** Is `threadId` a saved session? */
export async function hasSession(threadId: string) {
  return (await sessionLog.read(threadId, { limit: 1 })).length > 0;
}

/** The first thing the user said in a session, on one line. */
function titleOf(messages: ReadonlyArray<ModelMessage>) {
  const content = messages.find((message) => message.role === "user")?.content;
  const text =
    typeof content === "string"
      ? content
      : (content ?? []).flatMap((part) => (part.type === "text" ? [part.content] : []));
  return [text].flat().join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The saved sessions, newest first, with what the user said first. A
 * session with no message yet is left out. The threads of child agents
 * (`<session>:<agent>`) are not sessions of their own.
 * ponytail: it reads the files in full, newest first, until it has `limit`
 * sessions. An index file is faster when there are many big sessions.
 */
export async function listSessions(limit = 20) {
  const names = await readdir(SESSIONS_DIR).catch(() => []);
  const files = await Promise.all(
    names
      .filter((name) => name.endsWith(".jsonl"))
      .map(async (name) => ({
        id: decodeURIComponent(name.slice(0, -".jsonl".length)),
        updatedAt: (await stat(join(SESSIONS_DIR, name))).mtimeMs,
      })),
  );
  const recent = files
    .filter((file) => !file.id.includes(":"))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const messages = logMessageStore({ store: sessionLog });
  const sessions: Array<{ id: string; updatedAt: number; title: string }> = [];
  for (const file of recent) {
    if (sessions.length === limit) break;
    const title = titleOf(await messages.loadThread(file.id));
    if (title !== "") sessions.push({ ...file, title });
  }
  return sessions;
}
