import type { Tool } from "@tanstack/ai";

export interface GoogleMapsTool {
  /**
   * Whether to return a widget context token in the GroundingMetadata of the response. Developers can use the widget context token to render a Google Maps widget with geospatial context related to the places that the model references in the response.
   */
  enableWidget?: boolean;

}

export function convertGoogleMapsToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as { enableWidget?: boolean };
  return {
    googleMaps: metadata.enableWidget !== undefined ? { enableWidget: metadata.enableWidget } : {}
  };
}

export function googleMapsTool(config?: { enableWidget?: boolean }): Tool {
  return {
    type: "function",
    function: {
      name: "google_maps",
      description: "",
      parameters: {}
    },
    metadata: {
      enableWidget: config?.enableWidget
    }
  }
}