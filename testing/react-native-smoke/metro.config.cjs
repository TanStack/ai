const { existsSync } = require('node:fs')
const { dirname, resolve, sep } = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const repoRoot = resolve(__dirname, '../..')
const rewriteOriginRoots = [
  __dirname,
  resolve(repoRoot, 'packages/ai/src'),
  resolve(repoRoot, 'packages/ai-client/src'),
  resolve(repoRoot, 'packages/ai-event-client/src'),
  resolve(repoRoot, 'packages/ai-react/src'),
]

function isInPath(file, root) {
  return file === root || file.startsWith(`${root}${sep}`)
}

function canRewriteOrigin(originModulePath) {
  const origin = resolve(originModulePath)
  return rewriteOriginRoots.some((root) => isInPath(origin, root))
}

function sourceFileForJsSpecifier(originModulePath, moduleName) {
  if (!canRewriteOrigin(originModulePath)) {
    return undefined
  }

  if (!moduleName.startsWith('.') || !moduleName.endsWith('.js')) {
    return undefined
  }

  const withoutJs = resolve(dirname(originModulePath), moduleName.slice(0, -3))
  const candidates = [`${withoutJs}.ts`, `${withoutJs}.tsx`]

  return candidates.find((candidate) => existsSync(candidate))
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const sourceFile = sourceFileForJsSpecifier(
    context.originModulePath,
    moduleName,
  )
  if (sourceFile) {
    return {
      type: 'sourceFile',
      filePath: sourceFile,
    }
  }

  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
