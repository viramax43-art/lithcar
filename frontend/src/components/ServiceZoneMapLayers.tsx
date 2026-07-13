import { Polygon, Tooltip } from 'react-leaflet'
import type { ServiceZone } from '../types'

interface ServiceZoneMapLayersProps {
  zones: ServiceZone[]
  recommendedZoneIds?: Set<string>
  interactive?: boolean
  onSelectZone?: (zone: ServiceZone) => void
}

export default function ServiceZoneMapLayers({
  zones,
  recommendedZoneIds,
  interactive = false,
  onSelectZone,
}: ServiceZoneMapLayersProps) {
  return (
    <>
      {zones.map((zone) => {
        if (!zone.isActive || zone.polygon.length < 3) return null
        const isRecommended = recommendedZoneIds?.has(zone.id) ?? false
        const positions = zone.polygon.map((point) => [point.lat, point.lng] as [number, number])
        return (
          <Polygon
            key={zone.id}
            positions={positions}
            pathOptions={{
              color: zone.color,
              fillColor: zone.color,
              fillOpacity: isRecommended ? 0.22 : 0.12,
              weight: isRecommended ? 2.5 : 1.5,
              opacity: isRecommended ? 0.95 : 0.75,
            }}
            eventHandlers={
              interactive && onSelectZone
                ? {
                    click: (event) => {
                      event.originalEvent.stopPropagation()
                      onSelectZone(zone)
                    },
                  }
                : undefined
            }
          >
            <Tooltip sticky direction="top" opacity={0.95}>
              <span className="text-xs font-semibold">{zone.name}</span>
            </Tooltip>
          </Polygon>
        )
      })}
    </>
  )
}
