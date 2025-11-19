export interface GoogleSearchTool {
  timeRangeFilter?: {
    startTime?: string; // ISO 8601 format
    endTime?: string;   // ISO 8601 format
  }
}

export const googleSearchTool = (config?: GoogleSearchTool) => {
  return {
    "googleSearch": config || {}
  }
}