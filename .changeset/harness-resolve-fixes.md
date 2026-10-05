---
'@tanstack/ai-harness': patch
---

Fix three bugs in how a harness session answers interrupts and steers.

- A resolve whose payload fails validation (for example a client tool result that does not match its `outputSchema`) no longer drops the pause. The resolve still settles `failed`, but the interrupt stays pending, so a correct resolve continues the turn.
- A resolve sent as soon as a client reads `RUN_FINISHED` with interrupts is now accepted. Before, it was rejected with `no_pending_interrupts` or `busy` while the turn was still ending. The resolve now runs right after the interrupted turn ends.
- `prompt(text, { busy: 'steer' })` that joins the running turn now returns the running turn's id in its receipt, as `steer()` does.
