import { describe, expect, it } from 'vitest'
import * as root from '../src/index'
import * as plugins from '../src/first-party/index'
import * as pluginsNode from '../src/first-party/node'
import * as media from '../src/media-entry'
import * as oauth from '../src/oauth'
import * as server from '../src/server'

// The runtime names that each subpath holds. Types are not listed here: the
// tests that import them from a subpath fail `tsc` when one is missing.
const SERVER = [
  'HARNESS_PROTOCOL_VERSION',
  'applyInput',
  'capabilitiesOf',
  'createHarnessHandler',
  'handleHarnessSocket',
  'parseControlFrame',
  'parseHarnessInput',
  'requestUsers',
]
const OAUTH = [
  'buildAuthorizationUrl',
  'createPkce',
  'deviceLogin',
  'exchangeCode',
  'isExpired',
  'loopbackLogin',
  'refreshCredential',
  'startLoopbackReceiver',
]
const MEDIA = [
  'MEDIA_URL_PREFIX',
  'MediaError',
  'isMediaRecord',
  'kindOf',
  'mediaIdOf',
  'mediaOfMessage',
  'mediaPart',
  'mimeTypeOf',
]
const PLUGINS_NODE = [
  'agents',
  'boundToolOutput',
  'builtInAgents',
  'fileCommands',
  'projectInstructions',
]

/** The names in `names` that `module` exports. */
const exportedFrom = (module: object, names: Array<string>) =>
  names.filter((name) => name in module)

describe('subpath entry points', () => {
  it.each([
    ['server', server, SERVER],
    ['oauth', oauth, OAUTH],
    ['media', media, MEDIA],
    ['plugins/node', pluginsNode, PLUGINS_NODE],
  ])('./%s exports exactly its names', (_subpath, module, names) => {
    expect(Object.keys(module).sort()).toEqual(names)
  })

  it('the root does not export a name that moved to a subpath', () => {
    expect(exportedFrom(root, [...SERVER, ...OAUTH, ...MEDIA])).toEqual([])
  })

  it('the root keeps oauthConnector, because it builds a plugin', () => {
    expect(exportedFrom(root, ['oauthConnector'])).toEqual(['oauthConnector'])
  })

  it('the root has createHarnessWorker, because it needs no Node module', () => {
    expect(exportedFrom(root, ['createHarnessWorker'])).toEqual([
      'createHarnessWorker',
    ])
  })

  it('./plugins does not export the Node plugins', () => {
    expect(exportedFrom(plugins, PLUGINS_NODE)).toEqual([])
  })
})
