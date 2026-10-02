import { useTranslation } from 'react-i18next'

interface DriverMapLegendProps {
  topOffset: string
}

export default function DriverMapLegend({ topOffset }: DriverMapLegendProps) {
  const { t } = useTranslation()

  const items = [
    { color: '#F59E0B', label: t('driver.map.legendFreeOrder', { defaultValue: 'Свободный старт' }) },
    { color: '#3B82F6', label: t('driver.map.legendDestination', { defaultValue: 'Назначение' }) },
    { color: '#EF4444', label: t('driver.map.legendYourOrder', { defaultValue: 'Ваш заказ' }) },
  ]

  return (
    <div
      className="driver-map-legend absolute left-3 right-3 z-[12] flex items-center justify-center gap-3 bg-white/92 backdrop-blur-sm rounded-xl px-3 py-2 shadow-card md:max-w-md md:mx-auto"
      style={{ top: topOffset }}
    >
      {items.map((item) => (
        <div key={item.color} className="flex items-center gap-1.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
          <span className="text-[10px] text-muted font-medium truncate">{item.label}</span>
        </div>
      ))}
    </div>
  )
}
