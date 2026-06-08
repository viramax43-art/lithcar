import { TileLayer } from 'react-leaflet'
import { useTranslation } from 'react-i18next'

import { OSM_TILE_SUBDOMAINS, OSM_TILE_URL } from '../lib/mapTiles'

export default function LocalizedTileLayer() {
  const { t, i18n } = useTranslation()
  return (
    <TileLayer
      key={i18n.language}
      url={OSM_TILE_URL}
      subdomains={OSM_TILE_SUBDOMAINS}
      attribution={t('map.attribution')}
    />
  )
}
