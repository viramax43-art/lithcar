import 'leaflet'

declare module 'leaflet' {
  interface MarkerClusterGroupOptions {
    maxClusterRadius?: number
    spiderfyOnMaxZoom?: boolean
    showCoverageOnHover?: boolean
    zoomToBoundsOnClick?: boolean
    iconCreateFunction?: (cluster: MarkerCluster) => L.DivIcon
  }

  interface MarkerCluster {
    getChildCount(): number
  }

  function markerClusterGroup(options?: MarkerClusterGroupOptions): L.LayerGroup & {
    addLayer(layer: L.Layer): this
    removeLayer(layer: L.Layer): this
  }
}
