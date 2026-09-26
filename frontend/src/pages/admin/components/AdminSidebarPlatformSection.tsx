import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { PlatformSettingsConfig } from '../../../lib/platformSettingsDefaults'
import { SUPPORTED_LANGUAGES } from '../../../i18n/languages'
import { inputCls } from './AdminSidebarShared'
import type { AdminTab } from '../constants'

type Props = {
  activeTab: AdminTab
  platform: PlatformSettingsConfig
  onChange: (patch: Partial<PlatformSettingsConfig>) => Promise<boolean>
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center justify-between bg-surface text-left text-sm font-bold"
      >
        {title}
        <span className="text-muted text-xs">{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="p-3 space-y-2 border-t border-border">{children}</div> : null}
    </div>
  )
}

export function AdminSidebarPlatformSection({ activeTab, platform, onChange }: Props) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)

  if (activeTab !== 'system') return null

  const save = async (patch: Partial<PlatformSettingsConfig>) => {
    setSaving(true)
    try {
      await onChange(patch)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {saving ? <p className="text-xs text-muted">{t('common.saving', { defaultValue: 'Saving…' })}</p> : null}

      <Section title={t('admin.platform.passenger', { defaultValue: 'Пассажиры' })}>
        <label className="block text-sm">
          <span className="font-semibold">{t('admin.platform.defaultPoints', { defaultValue: 'Стартовые поинты' })}</span>
          <input
            type="number"
            min={0}
            className={inputCls + ' mt-1'}
            value={platform.passenger.defaultPointsBalance}
            onChange={(e) =>
              save({ passenger: { ...platform.passenger, defaultPointsBalance: Number(e.target.value) } })
            }
          />
        </label>
        <Toggle
          label={t('admin.platform.buyFromDriver', { defaultValue: 'Покупка поинтов у водителя, если нет баланса' })}
          checked={platform.passenger.allowBuyPointsFromDriverWhenEmpty}
          onChange={(v) => save({ passenger: { ...platform.passenger, allowBuyPointsFromDriverWhenEmpty: v } })}
        />
        <Toggle
          label={t('admin.platform.cashWhenEmpty', { defaultValue: 'Оплата водителю наличными без поинтов' })}
          checked={platform.passenger.allowDriverCashWhenEmpty}
          onChange={(v) => save({ passenger: { ...platform.passenger, allowDriverCashWhenEmpty: v } })}
        />
        <Toggle
          label={t('admin.platform.cardWhenEmpty', { defaultValue: 'Оплата водителю картой без поинтов' })}
          checked={platform.passenger.allowDriverCardWhenEmpty}
          onChange={(v) => save({ passenger: { ...platform.passenger, allowDriverCardWhenEmpty: v } })}
        />
        <Toggle
          label={t('admin.platform.showDestZones', { defaultValue: 'Показывать зоны назначения пассажирам' })}
          checked={platform.passenger.showDestinationZones}
          onChange={(v) => save({ passenger: { ...platform.passenger, showDestinationZones: v } })}
        />
        <p className="text-xs font-bold pt-1">{t('admin.platform.promoTemplate', { defaultValue: 'Шаблон акции' })}</p>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <textarea
            key={lang}
            className={inputCls + ' min-h-[56px] text-xs'}
            placeholder={lang.toUpperCase()}
            value={platform.passenger.promoMessageTemplate[lang]}
            onChange={(e) =>
              save({
                passenger: {
                  ...platform.passenger,
                  promoMessageTemplate: {
                    ...platform.passenger.promoMessageTemplate,
                    [lang]: e.target.value,
                  },
                },
              })
            }
          />
        ))}
      </Section>

      <Section title={t('admin.platform.driver', { defaultValue: 'Водители' })}>
        <Toggle
          label={t('admin.platform.reassign', { defaultValue: 'Автозамена водителя при отказе' })}
          checked={platform.driver.reassignmentEnabled}
          onChange={(v) => save({ driver: { ...platform.driver, reassignmentEnabled: v } })}
        />
        <label className="block text-sm">
          <span className="font-semibold">{t('admin.platform.reassignBonus', { defaultValue: 'Бонус за срочную заявку' })}</span>
          <input
            type="number"
            min={0}
            className={inputCls + ' mt-1'}
            value={platform.driver.reassignmentBonusPoints}
            onChange={(e) =>
              save({ driver: { ...platform.driver, reassignmentBonusPoints: Number(e.target.value) } })
            }
          />
        </label>
        <Toggle
          label={t('admin.platform.reassignPriority', { defaultValue: 'Приоритет срочных заявок на карте' })}
          checked={platform.driver.reassignmentPriorityBoost}
          onChange={(v) => save({ driver: { ...platform.driver, reassignmentPriorityBoost: v } })}
        />
        <Toggle
          label={t('admin.platform.defaultSellPoints', { defaultValue: 'Новые водители могут продавать поинты' })}
          checked={platform.driver.defaultCanSellPoints}
          onChange={(v) => save({ driver: { ...platform.driver, defaultCanSellPoints: v } })}
        />
        <Toggle
          label={t('admin.platform.defaultSelfAssign', { defaultValue: 'Новые водители — самоназначение' })}
          checked={platform.driver.defaultCanSelfAssign}
          onChange={(v) => save({ driver: { ...platform.driver, defaultCanSelfAssign: v } })}
        />
      </Section>

      <Section title={t('admin.platform.system', { defaultValue: 'Система и логика' })}>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="font-semibold">EUR / USD</span>
            <input
              type="number"
              step="0.01"
              min={0}
              className={inputCls + ' mt-1'}
              value={platform.system.eurUsdRate}
              onChange={(e) => save({ system: { ...platform.system, eurUsdRate: Number(e.target.value) } })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">{t('admin.platform.kmRatio', { defaultValue: 'Коэф. км' })}</span>
            <input
              type="number"
              step="0.01"
              min={0}
              className={inputCls + ' mt-1'}
              value={platform.system.kmRatioMultiplier}
              onChange={(e) =>
                save({ system: { ...platform.system, kmRatioMultiplier: Number(e.target.value) } })
              }
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="font-semibold">{t('admin.platform.stalePending', { defaultValue: 'Удалять висящие (мин)' })}</span>
            <input
              type="number"
              min={1}
              className={inputCls + ' mt-1'}
              value={platform.system.staleRequestMinutesPending}
              onChange={(e) =>
                save({ system: { ...platform.system, staleRequestMinutesPending: Number(e.target.value) } })
              }
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">{t('admin.platform.stalePast', { defaultValue: 'После времени поездки (мин)' })}</span>
            <input
              type="number"
              min={1}
              className={inputCls + ' mt-1'}
              value={platform.system.staleRequestMinutesPastRide}
              onChange={(e) =>
                save({ system: { ...platform.system, staleRequestMinutesPastRide: Number(e.target.value) } })
              }
            />
          </label>
        </div>
        <Toggle
          label={t('admin.platform.autoDeleteStale', { defaultValue: 'Автоудаление невостребованных заявок' })}
          checked={platform.system.autoDeleteStaleRequests}
          onChange={(v) => save({ system: { ...platform.system, autoDeleteStaleRequests: v } })}
        />
        <Toggle
          label={t('admin.platform.manualDeleteStale', { defaultValue: 'Ручное удаление в админке' })}
          checked={platform.system.manualDeleteStaleRequests}
          onChange={(v) => save({ system: { ...platform.system, manualDeleteStaleRequests: v } })}
        />
        <Toggle
          label={t('admin.platform.sidebarCompact', { defaultValue: 'Компактная панель на карте' })}
          checked={platform.system.sidebarCompactOnMap}
          onChange={(v) => save({ system: { ...platform.system, sidebarCompactOnMap: v } })}
        />
        <Toggle
          label={t('admin.platform.pickupZonesPassengers', { defaultValue: 'Зоны отправления видны пассажирам' })}
          checked={platform.system.pickupZonesVisibleToPassengers}
          onChange={(v) => save({ system: { ...platform.system, pickupZonesVisibleToPassengers: v } })}
        />
        <Toggle
          label={t('admin.platform.destZonesDrivers', { defaultValue: 'Зоны назначения видны водителям' })}
          checked={platform.system.destinationZonesVisibleToDrivers}
          onChange={(v) => save({ system: { ...platform.system, destinationZonesVisibleToDrivers: v } })}
        />
      </Section>
    </div>
  )
}
