import { createEffect, createSignal } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import type { Component } from 'solid-js'

interface FixtureNamePopoverProps {
  defaultName: string
  onCancel: () => void
  onSave: (name: string) => void
}

export const FixtureNamePopover: Component<FixtureNamePopoverProps> = (
  props,
) => {
  const styles = useStyles()
  const [name, setName] = createSignal(props.defaultName)
  let input: HTMLInputElement | undefined

  createEffect(() => {
    setName(props.defaultName)
    queueMicrotask(() => input?.focus())
  })

  const handleSave = () => {
    const trimmedName = name().trim()
    if (!trimmedName) return
    props.onSave(trimmedName)
  }

  return (
    <form
      class={styles().hookDetails.fixturePopover}
      data-testid="ai-devtools-fixture-save-popover"
      onSubmit={(event) => {
        event.preventDefault()
        handleSave()
      }}
    >
      <label class={styles().hookDetails.fixtureField}>
        <span class={styles().hookDetails.fixtureLabel}>Fixture name</span>
        <input
          ref={(element) => {
            input = element
          }}
          class={styles().hookDetails.fixtureInput}
          data-testid="ai-devtools-fixture-name-input"
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <div class={styles().hookDetails.fixtureActions}>
        <button
          class={styles().hookDetails.fixtureButton}
          data-testid="ai-devtools-fixture-save-confirm"
          type="submit"
        >
          Save
        </button>
        <button
          class={`${styles().hookDetails.fixtureButton} ${styles().hookDetails.fixtureButtonSecondary}`}
          data-testid="ai-devtools-fixture-save-cancel"
          type="button"
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
