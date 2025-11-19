export interface GoogleMapsTool {
  /**
   * Whether to return a widget context token in the GroundingMetadata of the response. Developers can use the widget context token to render a Google Maps widget with geospatial context related to the places that the model references in the response.
   */
  enableWidget?: boolean;

}

export const googleMapsTool = (config?: GoogleMapsTool) => {
  return {
    "googleMaps": config || {}
  }
}