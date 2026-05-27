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
}

export default function MarkerClusterGroup({ markers }: MarkerClusterGroupProps) {
  const map = useMap()

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (clusterObj) => {
        const count = clusterObj.getChildCount()
        let size: 'small' | 'medium' | 'large' = 'small'
        if (count >= 20) size = 'large'
        else if (count >= 8) size = 'medium'
        return L.divIcon({
          html: `<div>${count}</div>`,
          className: `marker-cluster-${size}`,
          iconSize: L.point(size === 'small' ? 36 : size === 'medium' ? 44 : 52, size === 'small' ? 36 : size === 'medium' ? 44 : 52),
        })
      },
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
  }, [map, markers])

  return null
}
