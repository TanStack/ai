/**
 * OpenAI key names and Anthropic xdotool key names, lower case, to
 * `KeyboardEvent.key` names.
 */
const KEYS: Record<string, string> = {
  ctrl: 'Control',
  control: 'Control',
  control_l: 'Control',
  control_r: 'Control',
  shift: 'Shift',
  shift_l: 'Shift',
  shift_r: 'Shift',
  alt: 'Alt',
  alt_l: 'Alt',
  alt_r: 'Alt',
  option: 'Alt',
  meta: 'Meta',
  meta_l: 'Meta',
  meta_r: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  super: 'Meta',
  super_l: 'Meta',
  super_r: 'Meta',
  win: 'Meta',
  enter: 'Enter',
  return: 'Enter',
  kp_enter: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  space: ' ',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  page_up: 'PageUp',
  prior: 'PageUp',
  pagedown: 'PageDown',
  page_down: 'PageDown',
  next: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  capslock: 'CapsLock',
  caps_lock: 'CapsLock',
  plus: '+',
  minus: '-',
}

/**
 * Maps one OpenAI or xdotool key name to a `KeyboardEvent.key` name.
 * The match ignores case. An unknown name comes back unchanged.
 */
export function toKey(name: string) {
  const known = KEYS[name.toLowerCase()]
  if (known !== undefined) return known
  const isFunctionKey = /^f\d{1,2}$/i.test(name)
  return isFunctionKey ? name.toUpperCase() : name
}

/**
 * Maps the keys of one combo, like `['CTRL', 'S']`, to `KeyboardEvent.key`
 * names. In a combo with more than one key, a single letter becomes lower
 * case. Then `Control` + `A` does not also send a capital `A`.
 */
export function toCombo(names: Array<string>) {
  const keys = names.map(toKey)
  if (keys.length < 2) return keys
  return keys.map((key) => (/^[A-Z]$/.test(key) ? key.toLowerCase() : key))
}

/** Splits an xdotool combo, like `ctrl+s`, and maps each key. */
export function parseKeyCombo(combo: string) {
  return toCombo(combo.split('+').map((name) => name.trim()))
}
