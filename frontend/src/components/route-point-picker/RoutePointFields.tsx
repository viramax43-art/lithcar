import { useTranslation } from 'react-i18next'
import { FieldRow } from './FieldRow'
import type { RoutePointPickerModel } from './types'

interface RoutePointFieldsProps {
  model: RoutePointPickerModel
}

export default function RoutePointFields({ model }: RoutePointFieldsProps) {
  const { t } = useTranslation()

  const addressPlaceholder = t('passenger.addressPlaceholder', { defaultValue: 'Move the map or search' })
  const pickPointAFirst = t('passenger.pickPointAFirst', { defaultValue: 'Pick point A first' })

  const openSearch = (field: 'from' | 'to') => {
    model.setActiveField(field)
    model.setShowSearch(true)
    model.setSearchQuery('')
    model.setSearchResults([])
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldRow
        dotClass="bg-point-a"
        label={t('passenger.fromLabel', { defaultValue: 'From' })}
        value={model.fromAddress}
        placeholder={addressPlaceholder}
        active={model.activeIsFrom}
        onClick={() => model.setActiveField('from')}
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
        placeholder={model.fromPoint ? addressPlaceholder : pickPointAFirst}
        active={!model.activeIsFrom}
        onClick={() => model.setActiveField('to')}
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
