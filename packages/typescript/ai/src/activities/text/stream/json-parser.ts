/**
 * JSON Parser for partial/incomplete JSON strings
 *
 * Used during streaming to parse tool call arguments that may be incomplete.
 */

import { parse as parsePartialJSONLib } from 'partial-json'

/**
 * JSON Parser interface - allows for custom parser implementations
 */
export interface JSONParser {
  /**
   * Parse a JSON string (may be incomplete/partial)
   * @param jsonString - The JSON string to parse
   * @returns The parsed object, or undefined if parsing fails
   */
  parse: (jsonString: string) => any
}

/**
 * Partial JSON Parser implementation using the partial-json library
 * This parser can handle incomplete JSON strings during streaming
 */
export class PartialJSONParser implements JSONParser {
  /**
   * Parse a potentially incomplete JSON string
   * @param jsonString - The JSON string to parse (may be incomplete)
   * @returns The parsed object, or undefined if parsing fails
   */
  parse(jsonString: string): any {
    if (!jsonString || jsonString.trim() === '') {
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

/**
 * Default parser instance
 */
export const defaultJSONParser = new PartialJSONParser()

/**
 * Parse partial JSON string (convenience function)
 * @param jsonString - The JSON string to parse (may be incomplete)
 * @returns The parsed object, or undefined if parsing fails
 */
export function parsePartialJSON(jsonString: string): any {
  return defaultJSONParser.parse(jsonString)
}
