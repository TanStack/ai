# @tanstack/ai-ollaya

## 0.2.0

### Minor Changes

- [#1562](https://github.com/TanStack/ai/pull/1562) [`f29596b`](https://github.com/TanStack/ai/commit/f29596ba407f7fc766f4484b492cb415f9b6a9ff) - Add `@tanstack/ai-ollaya`, an evaluate adapter for a local Ollaya decision
  server. `ollayaDecider(model)` runs `decide()` against the open-source `laya`
  models over Ollaya's `POST /v1/systemone` endpoint — same wire contract as
  TypeSafe's Jev, fully local, no API key. Defaults to `http://127.0.0.1:11435`.

### Patch Changes

- [#1571](https://github.com/TanStack/ai/pull/1571) [`e9ff416`](https://github.com/TanStack/ai/commit/e9ff4161efed9e6470755ba82edd66a9834c370a) - Treat a blank `baseURL` as the default Ollaya host, `http://127.0.0.1:11435`.

- Updated dependencies [[`3a09cf0`](https://github.com/TanStack/ai/commit/3a09cf04431a45810051ea5df6bb3935af421ddb), [`ee726f5`](https://github.com/TanStack/ai/commit/ee726f537dbb036d5edb756b92739afaa7573824), [`a5fce7f`](https://github.com/TanStack/ai/commit/a5fce7f95b8b9c6eb57697aa1e3f587bf27483b9), [`94116ad`](https://github.com/TanStack/ai/commit/94116ad137015b6f62fe62b4c06a335dbde36a49)]:
  - @tanstack/ai@0.64.0
