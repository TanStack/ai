import rootConfig from '../../../eslint.config.js'
import type { Linter } from 'eslint'

const config: Array<Linter.Config> = [
  ...rootConfig,
  {
    rules: {},
  },
]

export default config
