import { describe, expect, it } from 'vitest'
import { parseKeyCombo, toCombo, toKey } from '../src/keys'

describe('toKey', () => {
  it.each([
    ['ctrl', 'Control'],
    ['CTRL', 'Control'],
    ['esc', 'Escape'],
    ['cmd', 'Meta'],
    ['super', 'Meta'],
    ['alt', 'Alt'],
    ['shift', 'Shift'],
    ['enter', 'Enter'],
    ['space', ' '],
    ['backspace', 'Backspace'],
    ['left', 'ArrowLeft'],
    ['arrowdown', 'ArrowDown'],
    ['pageup', 'PageUp'],
    ['f5', 'F5'],
  ])('maps the OpenAI name %s to %s', (name, key) => {
    expect(toKey(name)).toBe(key)
  })

  it.each([
    ['Page_Down', 'PageDown'],
    ['Return', 'Enter'],
    ['BackSpace', 'Backspace'],
    ['KP_Enter', 'Enter'],
    ['Super_L', 'Meta'],
    ['Prior', 'PageUp'],
  ])('maps the xdotool name %s to %s', (name, key) => {
    expect(toKey(name)).toBe(key)
  })

  it('passes an unknown key name through unchanged', () => {
    expect(toKey('super_special')).toBe('super_special')
    expect(toKey('a')).toBe('a')
  })
})

describe('toCombo', () => {
  it('lower-cases a letter in a combo with a modifier', () => {
    expect(toCombo(['CTRL', 'S'])).toEqual(['Control', 's'])
  })

  it('keeps a single capital letter as it is', () => {
    expect(toCombo(['A'])).toEqual(['A'])
  })
})

describe('parseKeyCombo', () => {
  it('splits an xdotool combo and maps each key', () => {
    expect(parseKeyCombo('ctrl+shift+Page_Down')).toEqual([
      'Control',
      'Shift',
      'PageDown',
    ])
  })

  it('maps a single key', () => {
    expect(parseKeyCombo('Return')).toEqual(['Enter'])
  })
})
