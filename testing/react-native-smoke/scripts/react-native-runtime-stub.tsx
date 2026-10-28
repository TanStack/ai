import { createElement, type ReactNode } from 'react'

interface NativeViewProps {
  children?: ReactNode
  onChangeText?: (value: string) => void
  onPress?: () => void
  title?: string
  value?: string
}

function primitive(tag: string) {
  return function Primitive({
    children,
    onChangeText,
    ...props
  }: NativeViewProps) {
    return createElement(tag, {
      ...props,
      onChange: onChangeText
        ? (event: { target: { value: string } }) =>
            onChangeText(event.target.value)
        : undefined,
      children,
    })
  }
}

export const Button = ({ title, onPress }: NativeViewProps) =>
  createElement('button', { onClick: onPress, children: title })

export const SafeAreaView = primitive('main')
export const ScrollView = primitive('section')
export const Text = primitive('span')
export const TextInput = primitive('textarea')
export const View = primitive('div')

export const StyleSheet = {
  create<T extends Record<string, unknown>>(styles: T) {
    return styles
  },
}
