import { useCallback, useEffect, useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { adjustPassengerPoints, listAdminPassengers, type AdminPassenger } from '../../../infrastructure/api/adminApi'
import RatingBadge from '../../../components/RatingBadge'
import { inputCls } from './AdminSidebarShared'
import type { AdminTab } from '../constants'

export function AdminSidebarPassengersSection({ activeTab }: { activeTab: AdminTab }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<AdminPassenger[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [delta, setDelta] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listAdminPassengers(query, { limit: 80, offset: 0 })
      setItems(res.items)
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    if (activeTab !== 'passengers') return
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [activeTab, load])

  if (activeTab !== 'passengers') return null

  const selected = items.find((p) => p.userId === selectedId) ?? null

  return (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className={inputCls + ' pl-9'}
          placeholder={t('admin.passengers.search', { defaultValue: 'Telegram ID или @username' })}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-xs text-muted text-center py-8">{t('common.loading', { defaultValue: 'Загрузка…' })}</p>
      ) : null}

      {!loading && items.length === 0 ? (
        <p className="text-xs text-muted text-center py-8">
          {t('admin.passengers.empty', { defaultValue: 'Пассажиры не найдены' })}
        </p>
      ) : null}

      {items.map((p) => (
        <button
          key={p.userId}
          type="button"
          onClick={() => setSelectedId(p.userId)}
          className={`w-full text-left rounded-xl border p-3 transition ${
            selectedId === p.userId ? 'border-black bg-surface' : 'border-border hover:border-black/30'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{p.username ? `@${p.username}` : p.userId}</p>
              <p className="text-[11px] text-muted">{p.userId}</p>
            </div>
            <span className="text-sm font-extrabold">{p.pointsBalance} pt</span>
          </div>
          <RatingBadge rating={p.rating ?? 5} ratingCount={p.ratingCount} size="sm" />
        </button>
      ))}

      {selected ? (
        <div className="rounded-xl border border-border p-3 space-y-2 bg-surface">
          <p className="text-sm font-bold">{t('admin.passengers.adjust', { defaultValue: 'Корректировка баланса' })}</p>
          <div className="flex gap-2">
            <input
              type="number"
              className={inputCls}
              placeholder={t('admin.passengers.pointsDelta', { defaultValue: '+/- поинты' })}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
            <button
              type="button"
              className="px-3 py-2 rounded-pill bg-black text-white text-xs font-bold"
              onClick={async () => {
                const value = parseInt(delta, 10)
                if (!Number.isFinite(value) || value === 0) return
                const updated = await adjustPassengerPoints(selected.userId, { delta: value })
                setItems((prev) => prev.map((p) => (p.userId === updated.userId ? updated : p)))
                setDelta('')
              }}
            >
              {t('common.apply', { defaultValue: 'Применить' })}
            </button>
          </div>
          <button
            type="button"
            className="text-xs text-muted underline"
            onClick={async () => {
              const updated = await adjustPassengerPoints(selected.userId, { absolute: 100 })
              setItems((prev) => prev.map((p) => (p.userId === updated.userId ? updated : p)))
            }}
          >
            {t('admin.passengers.reset100', { defaultValue: 'Выдать 100 поинтов (дефолт)' })}
          </button>
        </div>
      ) : null}
    </div>
  )
}
