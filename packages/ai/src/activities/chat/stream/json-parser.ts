import { parse as parsePartialJSONLib } from 'partial-json'

export interface JSONParser {
  parse: (jsonString: string) => any
}

export class PartialJSONParser implements JSONParser {
  parse(jsonString: string): any {
    const isEmptyJsonString = !jsonString || jsonString.trim() === ''
    if (isEmptyJsonString) {
      return undefined
    }

    try {
      return parsePartialJSONLib(jsonString)
    } catch {
      // If partial parsing fails, return undefined
      // This is expected during early streaming when we have very little data
      return undefined
    }
  }
}

export const defaultJSONParser = new PartialJSONParser()

export function parsePartialJSON(jsonString: string): any {
  return defaultJSONParser.parse(jsonString)
}
