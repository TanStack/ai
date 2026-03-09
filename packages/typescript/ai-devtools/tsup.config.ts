import { defineConfig } from 'tsup'
import { generateTsupOptions, parsePresetOptions } from 'tsup-preset-solid'

const index_preset = {
  entries: {
    entry: 'src/index.ts',
    dev_entry: true,
    server_entry: true,
  },
  cjs: false,
  drop_console: true,
}

const production_preset = {
  entries: {
    entry: 'src/production.ts',
    dev_entry: true,
    server_entry: true,
  },
  cjs: false,
  drop_console: true,
  out_dir: 'dist/production',
}

export default defineConfig(() => {
  const index_options = generateTsupOptions(parsePresetOptions(index_preset))
  const production_options = generateTsupOptions(
    parsePresetOptions(production_preset),
  )

  return [...index_options, ...production_options].map((option) => ({
    ...option,
    clean: false,
  }))
})
