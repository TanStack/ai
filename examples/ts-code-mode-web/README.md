# ts-code-mode-web

TanStack AI Code Mode web example using React and TanStack Start.

## Setup

### Prerequisites

- Node.js >=18
- pnpm@10.17.0
- Xcode Command Line Tools (macOS)

### Installation

```bash
pnpm install
```

### Rebuilding `isolated-vm` (native module)

`@tanstack/ai-isolate-node` depends on [`isolated-vm`](https://github.com/laverdet/isolated-vm), a native Node.js addon that must be compiled from source when a prebuilt binary is not available for your Node.js version.

**When is this needed?**

The `isolated-vm` package ships prebuilt binaries for select Node.js ABI versions. If you are running a newer Node.js version whose ABI is not yet included (e.g. Node.js 25.x / ABI 141), you will see an error like:

```
Error: No native build was found for platform=darwin arch=arm64 runtime=node abi=141 ...
    loaded from: .../isolated-vm
```

**How to fix it**

1. Ensure Xcode Command Line Tools are installed (macOS):

   ```bash
   xcode-select --install
   ```

2. Run `node-gyp` via `npx` inside the `isolated-vm` package directory (from the monorepo root):

   ```bash
   ISOLATED_VM_DIR="node_modules/.pnpm/isolated-vm@6.1.0/node_modules/isolated-vm"
   cd "$ISOLATED_VM_DIR" && npx node-gyp rebuild
   ```

   Or as a one-liner from the monorepo root (`/Users/jherr/tanstack/ai/code-mode`):

   ```bash
   cd node_modules/.pnpm/isolated-vm@6.1.0/node_modules/isolated-vm && npx node-gyp rebuild
   ```

3. A successful build ends with `gyp info ok` and produces `build/Release/isolated_vm.node`.

**Notes**

- Linker warnings about macOS version mismatches (`building for macOS-11.0, but linking with dylib ... built for newer version`) are harmless and can be ignored.
- The compiled `.node` file lives in the pnpm content-addressable store and will need to be rebuilt after `pnpm install --force` or after upgrading Node.js to a different ABI version.
- Python 3 is required by `node-gyp`. It is detected automatically from `$PATH`.

### Node.js 25 + `isolated-vm` runtime crash (SIGSEGV)

Even after successfully compiling from source, `isolated-vm@6.1.0` crashes the server process (exit code 139, SIGSEGV) when run under **Node.js 25.x**. This is a V8 API incompatibility — Node 25 ships V8 14.1 whose internal C++ API has changed in ways that break `isolated-vm`'s isolate creation code at runtime.

**Symptom:** The server dies silently with no JavaScript error or log output when the first code mode request is made.

**Fix applied:** All server routes in this example have been switched from the `node` isolate driver to the `quickjs` driver (`@tanstack/ai-isolate-quickjs`), which is a pure-JS sandbox with no native addon dependency and works on any Node.js version.

**When `isolated-vm` works again:** Once `isolated-vm` publishes a release compatible with Node 25 / V8 14.1, switch the driver back to `'node'` in `src/lib/create-isolate-driver.ts` (default) and in each API route file. The `node` driver provides stronger isolation (true V8 process boundary) and is preferred in production.

## Development

```bash
pnpm dev   # starts the Vite dev server on port 3001
```

## Build

```bash
pnpm build
```
