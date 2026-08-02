import { test, expect } from './fixtures'
import {
  devtoolsUrl,
  expectClassChangesOnHover,
  expectHookNames,
  generationCard,
  openDevtools,
  selectHook,
  waitForAllGenerationHooks,
  waitForDevtoolsHarness,
} from './devtools-helpers'

const generationHooks = [
  { displayName: 'Image Studio', hookName: 'useGenerateImage' },
  { displayName: 'Audio Studio', hookName: 'useGenerateAudio' },
  { displayName: 'Speech Studio', hookName: 'useGenerateSpeech' },
  { displayName: 'Transcription Studio', hookName: 'useTranscription' },
  { displayName: 'Summary Studio', hookName: 'useSummarize' },
  { displayName: 'Video Studio', hookName: 'useGenerateVideo' },
] as const

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('generation hooks register all specialized hooks with generation-only detail chrome', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-generation-hooks', testId, aimockPort))
  await openDevtools(page)
  await expectHookNames(
    page,
    generationHooks.map((hook) => hook.displayName),
  )

  for (const hook of generationHooks) {
    await selectHook(page, hook.displayName)
    await expect(
      page.getByTestId('ai-devtools-hook-technical-name'),
    ).toHaveText(hook.hookName)
    await expect(page.getByTestId('ai-devtools-hook-tab')).toHaveText([
      'Generation',
      'State',
    ])
    await expect(page.getByTestId('ai-devtools-hook-metric-runs')).toBeVisible()
    await expect(
      page.getByTestId('ai-devtools-hook-metric-messages'),
    ).toHaveCount(0)
    await expect(page.getByTestId('ai-devtools-hook-metric-tools')).toHaveCount(
      0,
    )
    await expect(
      page.getByTestId('ai-devtools-hook-metric-tokens'),
    ).toHaveCount(0)
    await expect(page.getByTestId('ai-devtools-preview-pane')).toContainText(
      'No output yet.',
    )
  }
})

test('generation run history and output pane preserve ordered runs for every hook', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-generation-hooks', testId, aimockPort))
  await waitForDevtoolsHarness(page)
  await page.getByTestId('run-all-generation-hooks').click()
  await waitForAllGenerationHooks(page)
  await page.getByTestId('run-all-generation-hooks').click()
  await waitForAllGenerationHooks(page)

  await openDevtools(page)
  for (const hook of generationHooks) {
    await selectHook(page, hook.displayName)
    await expect(page.getByTestId('ai-devtools-generation-run')).toHaveCount(2)
    await expect(
      page.getByTestId('ai-devtools-generation-run').first(),
    ).toHaveAttribute('data-run-label', 'Run 1 of 2')
    await expect(
      page.getByTestId('ai-devtools-generation-run').last(),
    ).toHaveAttribute('data-run-label', 'Run 2 of 2')
    await expect(
      page.getByTestId('ai-devtools-hook-metric-runs'),
    ).toContainText('2')
    await expect(
      page.getByTestId('ai-devtools-generation-run').first(),
    ).toContainText('loading no')
  }

  await selectHook(page, 'Image Studio')
  await expect(page.getByTestId('ai-devtools-generation-output')).toHaveCount(4)
  await expect(
    page.getByTestId('ai-devtools-generation-output').first(),
  ).toHaveAttribute('data-output-kind', 'image')
  await expect(
    page.getByTestId('ai-devtools-generation-output').first(),
  ).toContainText('Run 1 of 2')
  await expect(
    page.getByTestId('ai-devtools-generation-output').last(),
  ).toContainText('Run 2 of 2')

  await selectHook(page, 'Audio Studio')
  await expect(page.getByTestId('ai-devtools-generation-output')).toHaveCount(2)
  await expect(
    page.getByTestId('ai-devtools-generation-output').first(),
  ).toHaveAttribute('data-output-kind', 'audio')
  await expect(
    page.getByTestId('ai-devtools-audio-output').first(),
  ).toHaveAttribute('src', /^data:audio\/wav;base64,/)
  await page.getByTestId('ai-devtools-audio-output').first().click()
  await expect(page.getByTestId('ai-devtools-output-modal')).toHaveCount(0)

  await selectHook(page, 'Speech Studio')
  await expect(
    page.getByTestId('ai-devtools-audio-output').first(),
  ).toHaveAttribute('src', /^data:audio\/wav;base64,/)
  await expect(generationCard(page, 'useGenerateSpeech')).toContainText('0.05s')

  await selectHook(page, 'Transcription Studio')
  await expect(
    page.getByTestId('ai-devtools-generation-output').first(),
  ).toContainText('Fender Stratocaster')

  await selectHook(page, 'Summary Studio')
  await expect(
    page.getByTestId('ai-devtools-generation-output').first(),
  ).toContainText('Fender Stratocaster')

  await selectHook(page, 'Video Studio')
  await expect(
    page.getByTestId('ai-devtools-generation-progress').last(),
  ).toHaveAttribute('aria-valuenow', '100')
  await expect(
    page.getByTestId('ai-devtools-video-output').first(),
  ).not.toHaveAttribute('controls', '')
})

test('generation output modal, hover linking, and reset cleanup work from visible UI', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-generation-hooks', testId, aimockPort))
  await waitForDevtoolsHarness(page)
  await page.getByTestId('run-useGenerateImage').click()
  await expect(
    generationCard(page, 'useGenerateImage').getByTestId(
      'generation-hook-status',
    ),
  ).toHaveText('success')

  await openDevtools(page)
  await selectHook(page, 'Image Studio')
  await expectClassChangesOnHover(
    page.getByTestId('ai-devtools-generation-run').first(),
    page.getByTestId('ai-devtools-generation-output').first(),
  )
  await expectClassChangesOnHover(
    page.getByTestId('ai-devtools-generation-output').first(),
    page.getByTestId('ai-devtools-generation-run').first(),
  )

  await page.getByTestId('ai-devtools-generation-output').first().click()
  await expect(page.getByTestId('ai-devtools-output-modal')).toBeVisible()
  const backdropBox = await page
    .getByTestId('ai-devtools-output-modal-backdrop')
    .boundingBox()
  expect(backdropBox?.width).toBeGreaterThan(500)
  expect(backdropBox?.height).toBeGreaterThan(500)
  await expect(
    page.getByTestId('ai-devtools-image-output').last(),
  ).toBeVisible()
  await page.getByTestId('ai-devtools-output-modal').click()
  await expect(page.getByTestId('ai-devtools-output-modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('ai-devtools-output-modal')).toHaveCount(0)

  await page.getByTestId('ai-devtools-generation-output').first().click()
  await page.getByTestId('ai-devtools-output-modal-close').click()
  await expect(page.getByTestId('ai-devtools-output-modal')).toHaveCount(0)

  await page.getByTestId('ai-devtools-generation-output').first().click()
  await page
    .getByTestId('ai-devtools-output-modal-backdrop')
    .click({ position: { x: 4, y: 4 } })
  await expect(page.getByTestId('ai-devtools-output-modal')).toHaveCount(0)

  await page.getByTestId('reset-useGenerateImage').click()
  await expect(
    generationCard(page, 'useGenerateImage').getByTestId(
      'generation-hook-output-count',
    ),
  ).toHaveText('0')
  await expect(page.getByTestId('ai-devtools-generation-run')).toHaveCount(0)
  await expect(page.getByTestId('ai-devtools-preview-pane')).toContainText(
    'No output yet.',
  )
})
