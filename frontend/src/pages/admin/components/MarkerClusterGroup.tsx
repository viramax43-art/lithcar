import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'

interface MarkerClusterGroupProps {
  markers: Array<{
    id: string
    position: [number, number]
    icon: L.DivIcon
    onClick?: () => void
    tooltipText?: string
  }>
  /** Hex color for cluster circle (e.g. "#F59E0B") */
  clusterColor?: string
}

function makeClusterIcon(count: number, color: string): L.DivIcon {
  const size = count >= 20 ? 52 : count >= 8 ? 44 : 36
  const fontSize = count >= 20 ? 14 : count >= 8 ? 13 : 12
  const borderColor = color + '55'
  const html = `<div style="
    width:${size}px;height:${size}px;
    border-radius:50%;
    background:${color};
    border:3px solid ${borderColor};
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-family:Inter,sans-serif;font-weight:800;font-size:${fontSize}px;
    box-shadow:0 2px 8px ${color}66;
  ">${count}</div>`
  return L.divIcon({
    html,
    className: '',
    iconSize: L.point(size, size),
    iconAnchor: [size / 2, size / 2],
  })
}

export default function MarkerClusterGroup({ markers, clusterColor = '#6B7280' }: MarkerClusterGroupProps) {
  const map = useMap()

  useEffect(() => {
    const color = clusterColor
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (clusterObj) => makeClusterIcon(clusterObj.getChildCount(), color),
    })

    markers.forEach((m) => {
      const marker = L.marker(m.position, { icon: m.icon })
      if (m.onClick) {
        marker.on('click', m.onClick)
      }
      if (m.tooltipText) {
        marker.bindTooltip(m.tooltipText, {
          permanent: false,
          direction: 'top',
          offset: [0, -14],
          className: 'marker-driver-label',
        })
      }
      cluster.addLayer(marker)
    })

    map.addLayer(cluster)

    return () => {
      map.removeLayer(cluster)
    }
  }, [map, markers, clusterColor])

  return null
}
