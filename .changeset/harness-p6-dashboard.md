---
'@tanstack/ai-dashboard': minor
'@tanstack/ai-harness-cli': minor
---

New package `@tanstack/ai-dashboard`: a self-hosted dashboard for harness sessions. `npx @tanstack/ai-dashboard` starts it (`startDashboard` in code). Agents dial out with `connectDashboard` from `@tanstack/ai-dashboard/connect`, pair with a one-time code, and get a revocable host token. The web app lists hosts and sessions, streams messages and tool calls, shows approval cards and plugin questions, and sends prompts, steers, and stops. It installs as a web app on a phone. Inputs for an offline host wait at the dashboard and reach it on reconnect.

`@tanstack/ai-harness-cli` adds `--dashboard <url>`, which pairs on first use (or reads `HARNESS_DASHBOARD_TOKEN`) and keeps the session connected.
