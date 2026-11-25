---
'@tanstack/ai-sandbox-docker': patch
---

`publishPorts` now publishes each port on 127.0.0.1 only, and `ports.connect` returns a `http://127.0.0.1:<port>` address. Before, Docker published the ports on every network interface, so other computers on the network could connect.
