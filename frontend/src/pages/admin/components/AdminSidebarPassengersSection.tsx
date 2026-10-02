import { useCallback, useEffect, useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { listAdminPassengers, type AdminPassenger } from '../../../infrastructure/api/adminApi'
import { inputCls } from './AdminSidebarShared'
import type { AdminTab } from '../constants'
import { AdminUserDossierModal } from './AdminUserDossierModal'

export function AdminSidebarPassengersSection({ activeTab }: { activeTab: AdminTab }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<AdminPassenger[]>([])
  const [loading, setLoading] = useState(false)
  const [dossierId, setDossierId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!query.trim()) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const res = await listAdminPassengers(query, { limit: 20, offset: 0 })
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

      {!query.trim() ? (
        <p className="text-xs text-muted text-center py-8">
          {t('admin.passengers.enterIdHint', { defaultValue: 'Введите Telegram ID или @username, чтобы найти пользователя' })}
        </p>
      ) : null}

      {loading ? (
        <p className="text-xs text-muted text-center py-8">{t('common.loading', { defaultValue: 'Загрузка…' })}</p>
      ) : null}

      {!loading && query.trim() && items.length === 0 ? (
        <p className="text-xs text-muted text-center py-8">
          {t('admin.passengers.empty', { defaultValue: 'Пользователи не найдены' })}
        </p>
      ) : null}

      {items.map((p) => (
        <button
          key={p.userId}
          type="button"
          onClick={() => setDossierId(p.userId)}
          className="w-full flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-left transition hover:border-black/30"
        >
          <span className="text-sm font-bold font-mono truncate">{p.userId}</span>
          {p.username ? <span className="text-xs text-muted">@{p.username}</span> : null}
          <span className="text-[10px] uppercase font-semibold text-muted flex-shrink-0">{p.role}</span>
        </button>
      ))}

      {dossierId ? <AdminUserDossierModal userId={dossierId} onClose={() => setDossierId(null)} /> : null}
    </div>
  )
}
