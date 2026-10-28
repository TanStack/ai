const { createRequire } = require('node:module')
const path = require('node:path')

const expoPackageJson = require.resolve('expo/package.json')
const expoRequire = createRequire(expoPackageJson)
const presetPackageJson = expoRequire.resolve('babel-preset-expo/package.json')
const presetRequire = createRequire(presetPackageJson)

module.exports = function (api) {
  api.cache(true)
  return {
    plugins: [
      [
        presetRequire.resolve('@babel/plugin-transform-flow-strip-types'),
        { allowDeclareFields: true },
      ],
    ],
    presets: [path.dirname(presetPackageJson)],
  }
}
