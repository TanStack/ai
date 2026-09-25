# @tanstack/ai-sandbox-boxd

## 0.2.0

### Minor Changes

- [#1372](https://github.com/TanStack/ai/pull/1372) [`69fbce4`](https://github.com/TanStack/ai/commit/69fbce4d61e8a3a54846d84f460ad1805dda3670) - Add `@tanstack/ai-sandbox-boxd`, a sandbox provider backed by boxd KVM
  microVMs. It implements the `SandboxProvider` / `SandboxHandle` contract:
  file reads and writes through the machine file API, commands with separate
  stdout and stderr and real exit codes, background processes over a streaming
  exec with a writable stdin, one public HTTPS URL per machine through
  `ports.connect`, `env` injection, and resume-by-id across stop, suspend and
  hibernate.

  `snapshot()` captures memory and disk into a boxd snapshot and waits until it
  is restorable, and `restoreSnapshot()` boots a new machine from it with the
  captured processes still running. `fork()` is a live boxd fork: disk, memory
  and running processes, ready in under a second.

  Every machine is created `isolated`, so the agent cannot reach the in-VM
  `boxd` CLI, the metadata endpoint, or other machines in the org. `kill()` is
  measured: the spawn wrapper leads its own process group under `setsid`, and
  the kill shell signals that group and checks that it is gone.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-sandbox@0.5.15
