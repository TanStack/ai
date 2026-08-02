import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const exampleRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = path.resolve(exampleRoot, '../..')
const config = require('../metro.config.cjs')

const origins = [
  path.resolve(exampleRoot, 'src/App.tsx'),
  path.resolve(repoRoot, 'packages/ai-react/src/use-chat.ts'),
]
const singletonModules = ['react', 'react/jsx-runtime', 'react-native']

function packageRoot(filePath, packageName) {
  const marker = `${path.sep}node_modules${path.sep}${packageName}${path.sep}`
  const index = filePath.lastIndexOf(marker)
  assert.notEqual(index, -1, `${filePath} is not inside ${packageName}`)
  return filePath.slice(0, index + marker.length - 1)
}

function packageVersion(filePath, packageName) {
  const packageJson = path.join(
    packageRoot(filePath, packageName),
    'package.json',
  )
  return require(packageJson).version
}

function resolveWithMetroConfig(originModulePath, moduleName) {
  return config.resolver.resolveRequest(
    {
      originModulePath,
      resolveRequest() {
        throw new Error(`Metro singleton resolver did not handle ${moduleName}`)
      },
    },
    moduleName,
    'ios',
  ).filePath
}

const appReact = realpathSync(
  require.resolve('react', { paths: [exampleRoot] }),
)
const appReactNative = realpathSync(
  require.resolve('react-native', { paths: [exampleRoot] }),
)

for (const origin of origins) {
  for (const moduleName of singletonModules) {
    const filePath = realpathSync(resolveWithMetroConfig(origin, moduleName))
    const packageName = moduleName.startsWith('react-native')
      ? 'react-native'
      : 'react'
    const expected = packageName === 'react' ? appReact : appReactNative
    const expectedRoot = packageRoot(expected, packageName)

    assert.equal(
      packageRoot(filePath, packageName),
      expectedRoot,
      `${moduleName} from ${origin} resolved to ${filePath}`,
    )

    console.log(
      `${path.relative(repoRoot, origin)} -> ${moduleName} -> ${packageName}@${packageVersion(
        filePath,
        packageName,
      )}`,
    )
  }
}
