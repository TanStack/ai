import { describe, expect, it } from 'vitest'
import { buildRepoReportPrompt } from './routes/api.sandbox-repo-report'
import { REPORT_REPO } from './repo-report-options'

describe('buildRepoReportPrompt', () => {
  it('names the repo and the explainer focus', () => {
    const prompt = buildRepoReportPrompt('explainer')
    expect(prompt).toContain(REPORT_REPO)
    expect(prompt).toContain('Do not change files.')
    expect(prompt).toContain('What this repo is')
  })
})
