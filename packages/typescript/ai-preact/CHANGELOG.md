# @tanstack/ai-preact

## 0.6.32

### Patch Changes

- Updated dependencies [[`e144a53`](https://github.com/TanStack/ai/commit/e144a53e4348bb0bc365dbe342c8538544242227)]:
  - @tanstack/ai@0.21.3
  - @tanstack/ai-client@0.11.7

## 0.6.31

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai@0.21.2
  - @tanstack/ai-client@0.11.6

## 0.6.30

### Patch Changes

- Updated dependencies [[`573f12e`](https://github.com/TanStack/ai/commit/573f12eb5a3b04a2625be92900099f48d6f76632)]:
  - @tanstack/ai@0.21.1
  - @tanstack/ai-client@0.11.5

## 0.6.29

### Patch Changes

- Expose the connection adapter primitives needed to build custom ([#597](https://github.com/TanStack/ai/pull/597))
  transports from every framework hook package. `@tanstack/ai-client`
  now re-exports `RunAgentInputContext` at its entry point, and
  `@tanstack/ai-react`, `@tanstack/ai-vue`, `@tanstack/ai-solid`,
  `@tanstack/ai-svelte`, and `@tanstack/ai-preact` now re-export
  `rpcStream`, `ConnectConnectionAdapter`, `SubscribeConnectionAdapter`,
  and `RunAgentInputContext` alongside the existing `stream`,
  `fetchServerSentEvents`, and `fetchHttpStream` re-exports.

  Previously, authors of WebSocket / persistent or RPC-backed adapters
  had to import these symbols from `@tanstack/ai-client` even though
  they were already pulling `useChat` from a framework package. No
  runtime change.

- Updated dependencies [[`ec1393d`](https://github.com/TanStack/ai/commit/ec1393db4383798e5f2574dfd87779c22c309529), [`a03d12b`](https://github.com/TanStack/ai/commit/a03d12b13ade93f3e262c6ffa996696ce27472ef), [`188fe11`](https://github.com/TanStack/ai/commit/188fe11b9b9691e5a241cfc416803da5b8ce5376)]:
  - @tanstack/ai@0.21.0
  - @tanstack/ai-client@0.11.4

## 0.6.28

### Patch Changes

- Updated dependencies [[`2ad137b`](https://github.com/TanStack/ai/commit/2ad137bd22512248bd1684cccce35ba89597cf96)]:
  - @tanstack/ai@0.20.1
  - @tanstack/ai-client@0.11.3

## 0.6.27

### Patch Changes

- Updated dependencies [[`496db9c`](https://github.com/TanStack/ai/commit/496db9c42a7d3051a1295091eae29ae1c31ef997)]:
  - @tanstack/ai@0.20.0
  - @tanstack/ai-client@0.11.2

## 0.6.26

### Patch Changes

- Updated dependencies [[`617b5b5`](https://github.com/TanStack/ai/commit/617b5b512a6b3989c442efa41975dacc194d882a)]:
  - @tanstack/ai@0.19.1
  - @tanstack/ai-client@0.11.1

## 0.6.25

### Patch Changes

- Updated dependencies [[`2e0e2eb`](https://github.com/TanStack/ai/commit/2e0e2eb72684aac82e570d57767656e218289b49)]:
  - @tanstack/ai@0.19.0
  - @tanstack/ai-client@0.11.0

## 0.6.24

### Patch Changes

- Updated dependencies [[`a9d1916`](https://github.com/TanStack/ai/commit/a9d19165a5028515cf1d091d611c8ac4b5b86099), [`e810153`](https://github.com/TanStack/ai/commit/e810153b34e593d3f3e1bbd8050164a6ad4423ed)]:
  - @tanstack/ai@0.18.0
  - @tanstack/ai-client@0.10.0

## 0.6.23

### Patch Changes

- Updated dependencies [[`98979f7`](https://github.com/TanStack/ai/commit/98979f7e72f4b5bfb816fb14b60a12871f8c4bec), [`02527c2`](https://github.com/TanStack/ai/commit/02527c28c3285829535cd486e529e659260b3c5d)]:
  - @tanstack/ai@0.17.0
  - @tanstack/ai-client@0.9.2

## 0.6.22

### Patch Changes

- Updated dependencies [[`87f305c`](https://github.com/TanStack/ai/commit/87f305c9961d608fd7bea93a5100698a98aed11d)]:
  - @tanstack/ai@0.16.0
  - @tanstack/ai-client@0.9.1

## 0.6.21

### Patch Changes

- Updated dependencies [[`a4e2c55`](https://github.com/TanStack/ai/commit/a4e2c55a79490c2245ff2de2d3e1803a533c867b), [`82078bd`](https://github.com/TanStack/ai/commit/82078bdabe28d7d4a15a2847d667f363bf0a9cbe), [`b2d3cc1`](https://github.com/TanStack/ai/commit/b2d3cc131a31c54bd1e5841f958fbe333514e508), [`13cceae`](https://github.com/TanStack/ai/commit/13cceaedf64e398ca15b8dbbbfe215329ea26794)]:
  - @tanstack/ai@0.15.0
  - @tanstack/ai-client@0.9.0

## 0.6.20

### Patch Changes

- fix(ai-react, ai-preact, ai-vue, ai-solid): propagate `useChat` callback changes ([#465](https://github.com/TanStack/ai/pull/465))

  `onResponse`, `onChunk`, and `onCustomEvent` were captured by reference at client creation time. When a parent component re-rendered with fresh closures, the `ChatClient` kept calling the originals. Every framework now wraps these callbacks so the latest `options.xxx` is read at call time (via `optionsRef.current` in React/Preact, and direct option access in Vue/Solid, matching the pattern already used for `onFinish` / `onError`). Clearing a callback (setting it to `undefined`) now correctly no-ops instead of continuing to invoke the stale handler.

- Updated dependencies [[`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`af9eb7b`](https://github.com/TanStack/ai/commit/af9eb7bbb875b23b7e99b2e6b743636daad402d1), [`008f015`](https://github.com/TanStack/ai/commit/008f0154f852e7e6734d3e3d35cad47780b52b7a), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a)]:
  - @tanstack/ai@0.14.0
  - @tanstack/ai-client@0.8.0

## 0.6.19

### Patch Changes

- Updated dependencies [[`c1fd96f`](https://github.com/TanStack/ai/commit/c1fd96ffbcee1372ab039127903162bdf5543dd9)]:
  - @tanstack/ai@0.13.0
  - @tanstack/ai-client@0.7.14

## 0.6.18

### Patch Changes

- Updated dependencies [[`e32583e`](https://github.com/TanStack/ai/commit/e32583e7612cede932baee6a79355e96e7124d90)]:
  - @tanstack/ai@0.12.0
  - @tanstack/ai-client@0.7.13

## 0.6.17

### Patch Changes

- Updated dependencies [[`633a3d9`](https://github.com/TanStack/ai/commit/633a3d93fff27e3de7c10ce0059b2d5d87f33245)]:
  - @tanstack/ai@0.11.1
  - @tanstack/ai-client@0.7.12

## 0.6.16

### Patch Changes

- Updated dependencies [[`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7), [`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7), [`1d6f3be`](https://github.com/TanStack/ai/commit/1d6f3bef4fd1c4917823612fbcd9450a0fd2e627)]:
  - @tanstack/ai@0.11.0
  - @tanstack/ai-client@0.7.11

## 0.6.15

### Patch Changes

- Updated dependencies [[`c780bc1`](https://github.com/TanStack/ai/commit/c780bc127755ecf7e900343bf0e4d4823ff526ca)]:
  - @tanstack/ai@0.10.3
  - @tanstack/ai-client@0.7.10

## 0.6.14

### Patch Changes

- Updated dependencies [[`4445410`](https://github.com/TanStack/ai/commit/44454100e5825f948bab0ce52c57c80d70c0ebe7)]:
  - @tanstack/ai@0.10.2
  - @tanstack/ai-client@0.7.9

## 0.6.13

### Patch Changes

- Updated dependencies [[`1d1c58f`](https://github.com/TanStack/ai/commit/1d1c58f33188ff98893edb626efd66ac73b8eadb)]:
  - @tanstack/ai@0.10.1
  - @tanstack/ai-client@0.7.8

## 0.6.12

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai@0.10.0
  - @tanstack/ai-client@0.7.7

## 0.6.11

### Patch Changes

- Updated dependencies [[`c0ae603`](https://github.com/TanStack/ai/commit/c0ae603b4febbfc2d5f549a67e107a4bd0ec09cc)]:
  - @tanstack/ai-client@0.7.6

## 0.6.10

### Patch Changes

- Updated dependencies [[`26d8243`](https://github.com/TanStack/ai/commit/26d8243bab564a547fed8adb5e129d981ba228ea)]:
  - @tanstack/ai@0.9.2
  - @tanstack/ai-client@0.7.5

## 0.6.9

### Patch Changes

- Updated dependencies [[`b8cc69e`](https://github.com/TanStack/ai/commit/b8cc69e15eda49ce68cc48848284b0d74a55a97c)]:
  - @tanstack/ai@0.9.1
  - @tanstack/ai-client@0.7.4

## 0.6.8

### Patch Changes

- Updated dependencies [[`842e119`](https://github.com/TanStack/ai/commit/842e119a07377307ba0834ccca0e224dcb5c46ea)]:
  - @tanstack/ai@0.9.0
  - @tanstack/ai-client@0.7.3

## 0.6.7

### Patch Changes

- Add an explicit subscription lifecycle to `ChatClient` with `subscribe()`/`unsubscribe()`, `isSubscribed`, `connectionStatus`, and `sessionGenerating`, while keeping request lifecycle state separate from long-lived connection state for durable chat sessions. ([#356](https://github.com/TanStack/ai/pull/356))

  Update the React, Preact, Solid, Svelte, and Vue chat bindings with `live` mode plus reactive subscription/session state, and improve `StreamProcessor` handling for concurrent runs and reconnects so active sessions do not finalize early or duplicate resumed assistant messages.

- Updated dependencies [[`64b9cba`](https://github.com/TanStack/ai/commit/64b9cba2ebf89162b809ba575c49ef12c0e87ee7), [`dc53e1b`](https://github.com/TanStack/ai/commit/dc53e1b89fddf6fc744e4788731e8ca64ec3d250)]:
  - @tanstack/ai@0.8.1
  - @tanstack/ai-client@0.7.2

## 0.6.6

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai@0.8.0
  - @tanstack/ai-client@0.7.1

## 0.6.5

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai@0.7.0
  - @tanstack/ai-client@0.7.0

## 0.6.4

### Patch Changes

- Updated dependencies [[`6dfffca`](https://github.com/TanStack/ai/commit/6dfffca99aeac1ada59eb288f8eb09e564d3db1e), [`6dfffca`](https://github.com/TanStack/ai/commit/6dfffca99aeac1ada59eb288f8eb09e564d3db1e)]:
  - @tanstack/ai@0.6.3
  - @tanstack/ai-client@0.6.0

## 0.6.3

### Patch Changes

- Updated dependencies [[`2ee0b33`](https://github.com/TanStack/ai/commit/2ee0b33386c1f1604c04c1f2f78a859f8a83fd2d)]:
  - @tanstack/ai@0.6.2
  - @tanstack/ai-client@0.5.3

## 0.6.2

### Patch Changes

- Updated dependencies [[`4fe31d4`](https://github.com/TanStack/ai/commit/4fe31d41c2c67ea721173d63cdfd5fbcbaf13d93)]:
  - @tanstack/ai-client@0.5.2

## 0.6.1

### Patch Changes

- Updated dependencies [[`d8678e2`](https://github.com/TanStack/ai/commit/d8678e254a8edfa4f95eeb059aa30083c18f52f8)]:
  - @tanstack/ai@0.6.1
  - @tanstack/ai-client@0.5.1

## 0.6.0

### Patch Changes

- Updated dependencies [[`5aa6acc`](https://github.com/TanStack/ai/commit/5aa6acc1a4faea5346f750322e80984abf2d7059), [`1f800aa`](https://github.com/TanStack/ai/commit/1f800aacf57081f37a075bc8d08ff397cb33cbe9)]:
  - @tanstack/ai@0.6.0
  - @tanstack/ai-client@0.5.0

## 0.5.4

### Patch Changes

- Updated dependencies [[`58702bc`](https://github.com/TanStack/ai/commit/58702bcaad31c46f8fd747b2f0e1daff2003beb9)]:
  - @tanstack/ai@0.5.1
  - @tanstack/ai-client@0.4.5

## 0.5.3

### Patch Changes

- Updated dependencies [[`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd), [`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd)]:
  - @tanstack/ai@0.5.0
  - @tanstack/ai-client@0.4.4

## 0.5.2

### Patch Changes

- Updated dependencies [[`6f886e9`](https://github.com/TanStack/ai/commit/6f886e96f2478374520998395357fdf3aa9149ab)]:
  - @tanstack/ai@0.4.2
  - @tanstack/ai-client@0.4.3

## 0.5.1

### Patch Changes

- Updated dependencies [[`6e1bb50`](https://github.com/TanStack/ai/commit/6e1bb5097178a6ad795273ca715f1e09d3f5a006)]:
  - @tanstack/ai@0.4.1
  - @tanstack/ai-client@0.4.2

## 0.5.0

### Minor Changes

- add multiple modalities support to the client ([#263](https://github.com/TanStack/ai/pull/263))

### Patch Changes

- Updated dependencies [[`0158d14`](https://github.com/TanStack/ai/commit/0158d14df00639ff5325680ae91b7791c189e60f)]:
  - @tanstack/ai@0.4.0
  - @tanstack/ai-client@0.4.1

## 0.4.0

### Minor Changes

- Added status property to useChat to track the generation lifecycle (ready, submitted, streaming, error) ([#247](https://github.com/TanStack/ai/pull/247))

### Patch Changes

- Updated dependencies [[`99ccee5`](https://github.com/TanStack/ai/commit/99ccee5c72df12adc13bede98142c6da84d13cc4), [`230bab6`](https://github.com/TanStack/ai/commit/230bab6417c8ff2c25586a12126c85e27dd7bc15)]:
  - @tanstack/ai-client@0.4.0
  - @tanstack/ai@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [[`e52135f`](https://github.com/TanStack/ai/commit/e52135f6ec3285227679411636e208ae84a408d7)]:
  - @tanstack/ai@0.3.0
  - @tanstack/ai-client@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`7573619`](https://github.com/TanStack/ai/commit/7573619a234d1a50bd2ac098d64524447ebc5869)]:
  - @tanstack/ai@0.2.2
  - @tanstack/ai-client@0.2.2

## 0.1.0

### Minor Changes

- Create initial release for preact ([#180](https://github.com/TanStack/ai/pull/180))

### Patch Changes

- Updated dependencies [[`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9), [`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9)]:
  - @tanstack/ai@0.2.1
  - @tanstack/ai-client@0.2.1
