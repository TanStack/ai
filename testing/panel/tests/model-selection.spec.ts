import { expect, test } from '@playwright/test'
import { MODEL_OPTIONS as panelModels } from '../src/lib/model-selection'
import { MODEL_OPTIONS as reactModels } from '../../../examples/ts-react-chat/src/lib/model-selection'
import { MODEL_OPTIONS as svelteModels } from '../../../examples/ts-svelte-chat/src/lib/model-selection'
import { MODEL_OPTIONS as vueModels } from '../../../examples/ts-vue-chat/src/lib/model-selection'

const retiringModels = [
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5-pro',
  'o3',
  'o3-pro',
]

for (const [name, models] of Object.entries({
  panel: panelModels,
  react: reactModels,
  svelte: svelteModels,
  vue: vueModels,
})) {
  test(`${name} offers the GPT-5 replacement without duplicate or retiring models`, () => {
    const openaiModels = models
      .filter((option) => option.provider === 'openai')
      .map((option) => option.model)
    expect(openaiModels).toContain('gpt-5.6-sol')
    expect(new Set(openaiModels).size).toBe(openaiModels.length)
    expect(
      openaiModels.filter((model) => retiringModels.includes(model)),
    ).toEqual([])
  })
}

test('the panel can select GPT-5.6 Sol', async ({ page }) => {
  await page.goto('/')
  const selector = page.locator('select').first()
  await expect(
    selector.getByRole('option', { name: 'OpenAI - GPT-5', exact: true }),
  ).toHaveCount(0)
  await selector.selectOption({ label: 'OpenAI - GPT-5.6 Sol' })
  await expect(selector.locator('option:checked')).toHaveText(
    'OpenAI - GPT-5.6 Sol',
  )
  await selector.selectOption({ label: 'OpenAI - GPT-4o' })
  await selector.selectOption({ label: 'OpenAI - GPT-5.6 Sol' })
  await expect(selector.locator('option:checked')).toHaveText(
    'OpenAI - GPT-5.6 Sol',
  )
})
