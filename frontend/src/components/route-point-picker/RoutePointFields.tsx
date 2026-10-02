import { useTranslation } from 'react-i18next'
import { FieldRow } from './FieldRow'
import type { RoutePointPickerModel } from './types'

interface RoutePointFieldsProps {
  model: RoutePointPickerModel
  /** Driver offer form uses its own instruction copy. */
  audience?: 'passenger' | 'driver'
}

export default function RoutePointFields({ model, audience = 'passenger' }: RoutePointFieldsProps) {
  const { t } = useTranslation()

  const pointASetupHint = audience === 'driver'
    ? t('driver.pointASetupHint', { defaultValue: 'Укажите место отправки и подтвердите' })
    : t('passenger.pointASetupHint', { defaultValue: 'Enter, adjust and confirm the address' })
  const pointBSetupHint = audience === 'driver'
    ? t('driver.pointBSetupHint', { defaultValue: 'Укажите назначение и подтвердите' })
    : t('passenger.pointBSetupHint', { defaultValue: 'Enter, adjust and confirm the destination' })

  const openSearch = (field: 'from' | 'to') => {
    model.setActiveField(field)
    model.setShowSearch(true)
    model.setSearchQuery('')
    model.setSearchResults([])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldRow
        dotClass="bg-point-a"
        label={t('passenger.fromLabel', { defaultValue: 'From' })}
        value={model.fromAddress}
        placeholder={model.fromPoint
          ? t('passenger.addressPlaceholder', { defaultValue: 'Move map or tap to search' })
          : pointASetupHint}
        active={model.activeIsFrom}
        onClick={() => {
          if (model.focusRouteField) model.focusRouteField('from')
          else model.setActiveField('from')
        }}
        onClear={model.fromPoint ? () => {
          model.setFromPoint(null)
          model.setFromAddress('')
          model.setActiveField('from')
          model.armPinFromMapCenter()
        } : undefined}
        onSearch={() => openSearch('from')}
      />
      <div className="ml-[18px] w-px h-2 bg-border" />
      <FieldRow
        dotClass="bg-point-b"
        label={t('passenger.toLabel', { defaultValue: 'To' })}
        value={model.toAddress}
        placeholder={model.fromPoint
          ? (model.toPoint
            ? t('passenger.addressPlaceholder', { defaultValue: 'Move map or tap to search' })
            : pointBSetupHint)
          : t('passenger.pickPointAFirst', { defaultValue: 'Pick point A first' })}
        active={!model.activeIsFrom}
        onClick={() => {
          if (!model.fromPoint) return
          if (model.focusRouteField) model.focusRouteField('to')
          else model.setActiveField('to')
        }}
        onClear={model.toPoint ? () => {
          model.setToPoint(null)
          model.setToAddress('')
          model.setActiveField('to')
          model.armPinFromMapCenter()
        } : undefined}
        onSearch={() => openSearch('to')}
      />
    </div>
  )
}
