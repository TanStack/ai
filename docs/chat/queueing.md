---
title: Message Queue
id: message-queue
order: 4
description: "Control what happens when the user sends while a reply is still streaming: queue, drop, or interrupt."
keywords:
  - tanstack ai
  - message queue
  - queue
  - whenBusy
  - interrupt
  - sendMessage
  - cancelQueued
---

The user hits send while the reply is in flight. You need a rule for that message: wait, ignore, or cut in.

By default the message waits in `queue`. It sends after the current run succeeds.

## 1. Show the pending queue

`useChat` exposes `queue` separately from `messages`. `cancelQueued(id)` drops an item before it sends:

```tsx group=queueing-messages
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages, queue, sendMessage, cancelQueued } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});
```

```tsx group=queueing-messages
function PendingQueue() {
  return (
    <>
      {queue.map((item) => (
        <div key={item.id} className="pending">
          {typeof item.content === "string" ? item.content : "[attachment]"}
          <button onClick={() => cancelQueued(item.id)}>Cancel</button>
        </div>
      ))}
    </>
  );
}
```

Render `queue` with a different style from `messages`. Once the text appears in `queue` or `messages`, clear the composer.

## 2. Pick `whenBusy`

Pass a `queue` option. A string is shorthand for `{ whenBusy }`:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { sendMessage } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  queue: { whenBusy: "queue", drain: "fifo", maxSize: 5 },
});
```

`whenBusy` is what happens to a send that arrives while the client is busy. The client is busy when a stream is active, a send is in flight, or the queue is draining:

- `"queue"` (default): hold the message. It sends once the run settles successfully.
- `"drop"`: ignore the send. The promise still resolves. The message never appears in `queue` or `messages`. Keep the composer text and show feedback if you want a retry.
- `"interrupt"`: abort the current stream and send the new message now. Already-queued messages stay. They drain after the interrupting send succeeds.

Override the policy for one send with the second argument to `sendMessage`:

```tsx
sendMessage("Never mind, do this instead", {
  whenBusy: "interrupt",
  body: { source: "composer" },
});
```

`body` is extra JSON for that request only. It is merged into `forwardedProps`.

## Later

- **`drain`**: `"fifo"` (default) sends queued items one at a time in order. `"batch"` merges the queue into one send after a successful settle (strings join with `\n`, multimodal parts stay in order, last `body` wins).
- **`maxSize`**: caps how many messages can wait (`0` means never queue).
- **`onOverflow`**: `"reject"` (default) ignores a send once `maxSize` is reached. `"drop-oldest"` evicts the oldest queued item to make room.
- **Strategy function**: pass a function as `queue` for per-send control. That form always drains FIFO. Per-call `whenBusy` still wins.

### When the queue drains versus flushes

- **Drain (auto-send)**: only after a successful stream settle, including after tool continuations finish.
- **Flush (discard without sending)**: on error or abort of the active generation (`stop()`, real stream errors), `clear()`, `unsubscribe()`, and `reload()`.
- **`interrupt` does not flush**: existing queued items remain. They drain after the interrupting turn succeeds.

The composer no longer fights the stream. A send while busy waits, drops, or cuts in, on purpose.
