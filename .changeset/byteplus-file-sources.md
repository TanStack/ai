---
'@tanstack/ai-byteplus': patch
---

The BytePlus image and video adapters throw on an AG-UI `{ type: 'file' }` source. Pass a `data` or `url` source. Before this, a file handle was sent as a data URL.
