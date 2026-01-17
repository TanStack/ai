'use client'

const PROMPTS = [
  {
    locale: 'EN',
    prompt: 'Show captured orders created after February 1, 2025',
  },
  { locale: 'JA', prompt: '失われた紛争を教えて' },
  {
    locale: 'SV',
    prompt:
      'Visa mig USD-avstämningar som slutfördes mellan 01-01-2025 och 25-05-2025',
  },
]

type QuickPromptsProps = {
  onClick: (value: string) => void
}

function QuickPrompts({ onClick }: QuickPromptsProps) {
  function makePromptClickHandler(value: string) {
    return () => onClick(value)
  }

  return (
    <div className="space-y-2">
      <p className="text-center text-sm text-muted-foreground">
        Quick prompts:
      </p>
      <ul className="flex flex-wrap justify-center gap-2">
        {PROMPTS.map(({ prompt, locale }) => (
          <li key={prompt}>
            <button
              className="text-sm px-2 py-1 rounded bg-slate-700 text-cyan-400 cursor-pointer hover:bg-slate-600 transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              type="button"
              onClick={makePromptClickHandler(prompt)}
            >
              {locale} &bull; {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default QuickPrompts
