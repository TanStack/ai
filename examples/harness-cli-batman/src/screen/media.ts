import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { useEffect, useState } from "react";
import { assistant } from "../harness";
import type { MediaPart, SessionView, ViewMessage, ViewPart } from "@tanstack/ai-harness/view";

// ponytail: the CLI's default media folder, `./<harness-name>-media`. A custom
// ui gets no `--media-dir`, and the CLI does not export `defaultMediaDir`, so
// this copies its rule. The media id in front of the name keeps names unique.
export const mediaDir = `${assistant.name.replace(/[^\w.-]+/g, "-").replace(/^[-.]+|-+$/g, "")}-media`;

/** A media file the screen saved. `number` is what `/open` and `/play` take. */
export interface Saved {
  id: string;
  number: number;
  kind: string;
  name: string;
  path?: string;
  error?: string;
}

/** Write the bytes of a media file into `mediaDir`, and return the path. */
async function saveMedia(part: MediaPart) {
  await mkdir(mediaDir, { recursive: true });
  const path = join(mediaDir, `${part.id}-${basename(part.name)}`);
  await writeFile(path, await part.load());
  return path;
}

/** Add the media parts of `parts` to `into`, also the ones of child agents. */
function collectMedia(parts: ReadonlyArray<ViewPart>, into: Array<MediaPart>) {
  for (const part of parts) {
    if (part.type === "media") into.push(part);
    if (part.type === "agent") collectMedia(part.parts, into);
  }
}

/** The media files that the agents made, from the assistant messages. */
function generatedMedia(messages: ReadonlyArray<ViewMessage>) {
  const media: Array<MediaPart> = [];
  for (const message of messages) {
    if (message.role === "assistant") collectMedia(message.parts, media);
  }
  return media;
}

/**
 * Save each new media file once, and number it. Files in the history when
 * the screen opens are not saved again. `saving(id)`: is that file new, and
 * neither saved nor failed yet?
 */
export function useSavedMedia(view: SessionView, messages: Array<ViewMessage>) {
  const [saved, setSaved] = useState<ReadonlyArray<Saved>>([]);
  const [seen] = useState(
    () => new Set(generatedMedia(view.store.get().messages).map((part) => part.id)),
  );
  useEffect(() => {
    for (const part of generatedMedia(messages)) {
      if (seen.has(part.id)) continue;
      seen.add(part.id);
      const number = seen.size;
      const update = (change: Partial<Saved>) =>
        setSaved((current) =>
          current.map((item) => (item.id === part.id ? { ...item, ...change } : item)),
        );
      setSaved((current) => [
        ...current,
        { id: part.id, number, kind: part.kind, name: part.name },
      ]);
      saveMedia(part).then(
        (path) => update({ path }),
        (error: unknown) =>
          update({
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    }
  }, [messages, seen]);
  const saving = (id: string) => {
    if (!seen.has(id)) return true;
    const item = saved.find((entry) => entry.id === id);
    return item !== undefined && !item.path && !item.error;
  };
  return { saved, saving };
}

/** Start a program without a shell. The screen still shows the path on error. */
function launch(command: string, args: Array<string>) {
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

/** Open a link or a file with the default app. No shell is involved. */
export function openExternal(target: string) {
  if (process.platform === "win32") {
    // Not `cmd /c start`: cmd would read `&` in a URL as a command separator.
    if (/^https?:\/\//.test(target)) launch("rundll32", ["url.dll,FileProtocolHandler", target]);
    else launch("explorer", [resolve(target)]);
    return;
  }
  launch(process.platform === "darwin" ? "open" : "xdg-open", [target]);
}

/** Play audio or video with ffplay, which comes with ffmpeg. */
export function play(item: Saved & { path: string }) {
  const window = item.kind === "video" ? [] : ["-nodisp"];
  launch(process.env.FFPLAY_PATH || "ffplay", [
    ...window,
    "-autoexit",
    "-loglevel",
    "quiet",
    item.path,
  ]);
}
