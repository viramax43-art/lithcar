import { useCallback, useEffect, useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { createAdminInfoBlock, deleteAdminInfoBlock, listAdminInfoBlocks } from '../../../infrastructure/api/notificationsApi'
import type { InfoBlock } from '../../../types'
import InlineConfirm from './InlineConfirm'
import { inputCls, Section } from './AdminSidebarShared'

type AdminNotificationsSectionProps = {
  canManage: boolean
}

export function AdminNotificationsSection({ canManage }: AdminNotificationsSectionProps) {
  const { t } = useTranslation()
  const [pool, setPool] = useState<'passenger' | 'driver'>('passenger')
  const [items, setItems] = useState<InfoBlock[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    if (!canManage) return
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const blocks = await listAdminInfoBlocks(pool)
      setItems(blocks)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }, [canManage, pool, t])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) return
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await createAdminInfoBlock({ pool, title: title.trim(), body: body.trim() })
      setTitle('')
      setBody('')
      await loadItems()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setErrorMessage(null)
    try {
      await deleteAdminInfoBlock(id)
      await loadItems()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('common.error'))
    }
  }

  if (!canManage) return null

  return (
    <Section title={t('notifications.infoBlocks.title')}>
      <div className="space-y-3">
        <p className="text-[11px] text-muted leading-relaxed">{t('notifications.infoBlocks.hint')}</p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPool('passenger')}
            className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
              pool === 'passenger' ? 'bg-black text-white border-black' : 'bg-surface text-muted border-border'
            }`}
          >
            {t('notifications.send.poolPassengers')}
          </button>
          <button
            type="button"
            onClick={() => setPool('driver')}
            className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
              pool === 'driver' ? 'bg-black text-white border-black' : 'bg-surface text-muted border-border'
            }`}
          >
            {t('notifications.send.poolDrivers')}
          </button>
        </div>

        <div className="space-y-2">
          {isLoading && items.length === 0 && (
            <p className="text-xs text-muted">{t('common.loading')}</p>
          )}
          {!isLoading && items.length === 0 && (
            <p className="text-xs text-muted rounded-xl border border-dashed border-border px-3 py-4 text-center">
              {t('notifications.infoBlocks.emptyPool')}
            </p>
          )}
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-surface px-3 py-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-black leading-snug">{item.title}</p>
                <InlineConfirm
                  label={t('common.delete')}
                  confirmLabel={t('common.confirmDelete')}
                  onConfirm={() => void handleDelete(item.id)}
                  className="flex-shrink-0"
                />
              </div>
              <p className="text-xs text-muted whitespace-pre-wrap line-clamp-4">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="rounded-card border border-border p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {t('notifications.infoBlocks.addNew')}
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('notifications.send.titlePlaceholder')}
            className={inputCls}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('notifications.send.bodyPlaceholder')}
            rows={4}
            className={`${inputCls} resize-y min-h-[96px]`}
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isSaving || !title.trim() || !body.trim()}
            className={`w-full py-2.5 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 transition-all ${
              !isSaving && title.trim() && body.trim()
                ? 'bg-black text-white active:scale-[0.98]'
                : 'bg-surface text-muted'
            }`}
          >
            <Plus size={16} weight="bold" />
            {isSaving ? t('common.saving') : t('notifications.infoBlocks.addButton')}
          </button>
        </div>

        {errorMessage && <p className="text-xs font-medium text-red-600">{errorMessage}</p>}
      </div>
    </Section>
  )
}
