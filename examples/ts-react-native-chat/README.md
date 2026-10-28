# TanStack AI React Native Chat

Manual React Native verifier for TanStack AI streaming transports, presented as
a multi-turn mobile recipe app. If you want the docs-first setup path, start
with the public [Quick Start: React Native](https://tanstack.com/ai/latest/docs/getting-started/quick-start-react-native).

This example targets Expo SDK 54 so it can be opened with the Expo Go app
currently distributed through the Play Store for SDK 54.

You start with an Expo app, a local Hono/OpenAI server, and an Expo Go device or
emulator. By the end of this README, you can scan the QR code, pick a transport,
and stream structured recipe revisions from OpenAI without bundling provider
secrets into the app.

This Expo app talks to a local Hono server and lets you manually test:

- `fetchHttpStream` against `POST /chat/http`
- `xhrHttpStream` against `POST /chat/http`
- `xhrServerSentEvents` against `POST /chat/sse`

The UI behaves like a recipe app first and a transport tester second. It keeps
transport controls in a compact Testing mode panel, then shows the latest
recipe as the primary card with title, summary, servings, timing, tags,
ingredients, steps, notes, warnings, and revision. Compact request bubbles
remain available so you can confirm each follow-up changed the recipe.

The server streams live structured recipe responses from OpenAI through
`@tanstack/ai` and `@tanstack/ai-openai`. It is OpenAI-only and does not include
deterministic recipe fixtures or a no-key fallback.

Create `examples/ts-react-native-chat/.env` or set shell environment variables
before running the example. Values loaded from `.env` are server-only by
default; the dev runner passes them to the local Hono server, but does not pass
non-public values such as `OPENAI_API_KEY` to Expo or the phone:

- `OPENAI_API_KEY` is required for `/chat/http` and `/chat/sse`.
- `OPENAI_MODEL` is optional and defaults to `gpt-5.2`.

`.env` example:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.2
```

PowerShell example if you prefer shell variables:

```powershell
$env:OPENAI_API_KEY = 'sk-...'
$env:OPENAI_MODEL = 'gpt-5.2'
pnpm --filter ts-react-native-chat dev
```

The `dev` and `dev:server` scripts load `.env` from this example directory for
the server process. The `dev` script starts Expo with Expo dotenv loading
disabled and only passes public/mobile configuration, such as
`EXPO_PUBLIC_TANSTACK_AI_BASE_URL`, so secrets are not bundled into the native
app. If `OPENAI_API_KEY`, `OPENAI_MODEL`, or another server setup value is
invalid, the app receives a stream error with an actionable message instead of a
bare XHR `400 undefined` failure.

The package scripts that invoke Expo directly, such as `dev:app` and
`smoke:expo`, also start Expo with dotenv loading disabled. If you run ad hoc
Expo commands manually from this example, such as
`pnpm --filter ts-react-native-chat exec expo install --check`, set
`EXPO_NO_DOTENV=1` first when `.env` contains provider credentials.

## Run

```bash
pnpm install --no-frozen-lockfile
pnpm --filter ts-react-native-chat dev
```

The `dev` script starts both processes:

- Hono server on `0.0.0.0:8787` by default
- Expo/Metro dev server for the native React Native app in LAN mode

`pnpm dev` prints an Expo Go QR code. Scan it from a phone on the same Wi-Fi
network to open the app.

The script also auto-detects a non-internal IPv4 LAN address and starts Expo
with `EXPO_PUBLIC_TANSTACK_AI_BASE_URL=http://<lan-ip>:8787`, so the phone can
reach the Hono server. If you already set `EXPO_PUBLIC_TANSTACK_AI_BASE_URL`,
the script keeps your value.

Only `EXPO_PUBLIC_*` values are intended to reach the React Native app and
phone. Keep provider credentials and other server-only settings as plain
non-public names, such as `OPENAI_API_KEY`, in `.env`.

Expo manages the Metro host for the QR code, manifest, and bundle URLs. The
script does not set `REACT_NATIVE_PACKAGER_HOSTNAME` unless you already set it
in your environment.

Set `PORT` if you want the Hono server to listen somewhere else. `pnpm dev`
uses the same port for the server process and the generated Expo backend URL.

To inspect the chosen addresses without starting dev servers:

```bash
pnpm --filter ts-react-native-chat dev -- --print-config
```

The config includes `lanInterfaceName` so you can confirm the selected backend
IP came from a phone-reachable adapter such as Wi-Fi or Ethernet instead of a
virtual adapter. It also shows whether the Metro host is Expo-managed or came
from an explicit `REACT_NATIVE_PACKAGER_HOSTNAME` override. It reports
`serverOpenAIKeyLoaded: true` or `false`, but never prints the key value.

This example is native-only. Do not open `http://localhost:8081` expecting a
web UI; port 8081 is Metro's manifest and bundle server, so seeing JSON there is
expected.

Launch the app from the Expo terminal UI instead:

- Expo Go: scan the QR code with the Expo Go app on your device.
- Android emulator: run `expo start --android` from this example or press `a` in
  the Expo terminal UI.
- iOS simulator on macOS: run `expo start --ios` from this example or press `i`
  in the Expo terminal UI.

## Device URLs And Overrides

The app reads `EXPO_PUBLIC_TANSTACK_AI_BASE_URL` and defaults to `http://127.0.0.1:8787`.

`pnpm dev` sets this automatically for physical devices. Set it manually if the
chosen IP is wrong, your computer has multiple network adapters, or you are
running only `pnpm dev:app`:

- iOS simulator: `http://127.0.0.1:8787` usually works.
- Android emulator: use `http://10.0.2.2:8787`.
- Physical device: use your computer's LAN IP, for example `http://192.168.1.10:8787`.

Expo normally chooses the Metro host automatically. Only set
`REACT_NATIVE_PACKAGER_HOSTNAME` to a LAN IP without a protocol or port for
unusual network cases, such as Expo choosing a VPN or virtual adapter.

PowerShell example:

```powershell
$env:EXPO_PUBLIC_TANSTACK_AI_BASE_URL = 'http://10.0.2.2:8787'
pnpm --filter ts-react-native-chat dev
```

Physical device PowerShell override example:

```powershell
$env:REACT_NATIVE_PACKAGER_HOSTNAME = '192.168.1.10'
$env:EXPO_PUBLIC_TANSTACK_AI_BASE_URL = 'http://192.168.1.10:8787'
pnpm --filter ts-react-native-chat dev
```

Custom server port example:

```powershell
$env:PORT = '9999'
pnpm --filter ts-react-native-chat dev
```

cmd example:

```bat
set EXPO_PUBLIC_TANSTACK_AI_BASE_URL=http://10.0.2.2:8787
pnpm --filter ts-react-native-chat dev
```

macOS/Linux example:

```sh
EXPO_PUBLIC_TANSTACK_AI_BASE_URL=http://10.0.2.2:8787 pnpm --filter ts-react-native-chat dev
```

## Troubleshooting Physical Devices

If Expo Go scans the QR code but stays stuck before the app starts:

- Run `pnpm --filter ts-react-native-chat dev -- --print-config` and confirm `metroHost` is `Expo-managed` unless you intentionally set `REACT_NATIVE_PACKAGER_HOSTNAME`. Also confirm `lanInterfaceName` is a physical adapter, not `127.0.0.1`, WSL, Docker, Hyper-V, VPN, or another virtual adapter.
- From the phone browser, open `http://<lan-ip>:8787/health` and confirm it returns `{"ok":true}`.
- Confirm the phone and computer are on the same Wi-Fi network and client isolation is disabled.
- Allow Node.js through the firewall on private networks for Metro port `8081` and the Hono server port `8787`.
- If your computer has multiple adapters or VPNs and Expo chooses the wrong Metro host, set `REACT_NATIVE_PACKAGER_HOSTNAME=<lan-ip>` manually. Keep or set `EXPO_PUBLIC_TANSTACK_AI_BASE_URL=http://<lan-ip>:8787` for the Hono backend.
- If the app opens to a white screen, collect Metro terminal output and device runtime logs. The bundle URL is already controlled by Expo unless you set `REACT_NATIVE_PACKAGER_HOSTNAME`, so the next signal should be the JavaScript/native error shown in those logs.

## Troubleshooting Android Emulator Launches

If Expo cannot launch the Android emulator and prints Android SDK or `adb`
messages, this is an environment issue rather than a TanStack AI transport
failure. Confirm Android Studio installed the Android SDK, that an emulator is
created in Device Manager, and that `adb` is available on `PATH`.

Common Windows paths to check:

- `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`
- `%ANDROID_HOME%\platform-tools\adb.exe`
- `%ANDROID_SDK_ROOT%\platform-tools\adb.exe`

After changing SDK environment variables or `PATH`, restart the terminal and
run:

```powershell
adb devices
pnpm --filter ts-react-native-chat dev
```

If `adb devices` does not list an emulator or attached device, fix that before
debugging app-level networking or streaming behavior.

## Validation

```bash
pnpm --filter ts-react-native-chat typecheck
pnpm --filter ts-react-native-chat smoke:expo
pnpm --filter ts-react-native-chat verify:react-resolution
pnpm --filter ts-react-native-chat test:dev-script
```
