import { useCallback, useEffect, useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { SUPPORTED_LANGUAGES } from '../../../i18n/languages'
import { createAdminInfoBlock, deleteAdminInfoBlock, listAdminInfoBlocks } from '../../../infrastructure/api/notificationsApi'
import {
  EMPTY_USER_INFO_TEXT,
  hasUserInfoText,
  resolveUserInfoText,
  type UserInfoTextI18n,
} from '../../../lib/userInfoText'
import { useAutoTranslatedText } from '../../../lib/useAutoTranslatedText'
import type { InfoBlock } from '../../../types'
import InlineConfirm from './InlineConfirm'
import { inputCls, Section } from './AdminSidebarShared'

type AdminNotificationsSectionProps = {
  canManage: boolean
}

export function AdminNotificationsSection({ canManage }: AdminNotificationsSectionProps) {
  const { t, i18n } = useTranslation()
  const [pool, setPool] = useState<'passenger' | 'driver'>('passenger')
  const [items, setItems] = useState<InfoBlock[]>([])
  const [titleDraft, setTitleDraft] = useState<UserInfoTextI18n>({ ...EMPTY_USER_INFO_TEXT })
  const [bodyDraft, setBodyDraft] = useState<UserInfoTextI18n>({ ...EMPTY_USER_INFO_TEXT })
  const [audience, setAudience] = useState<'all' | 'user'>('all')
  const [targetUsername, setTargetUsername] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const updateTranslatedTitle = useAutoTranslatedText(setTitleDraft)
  const updateTranslatedBody = useAutoTranslatedText(setBodyDraft)

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

  const canSubmit =
    hasUserInfoText(titleDraft) && hasUserInfoText(bodyDraft) && (audience === 'all' || targetUsername.trim())

  const handleCreate = async () => {
    if (!canSubmit) return
    if (audience === 'user' && !targetUsername.trim()) {
      setErrorMessage(t('notifications.send.recipientRequired'))
      return
    }
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await createAdminInfoBlock({
        pool,
        titleI18n: titleDraft,
        bodyI18n: bodyDraft,
        audience,
        targetUsername: audience === 'user' ? targetUsername.trim() : null,
      })
      setTitleDraft({ ...EMPTY_USER_INFO_TEXT })
      setBodyDraft({ ...EMPTY_USER_INFO_TEXT })
      setTargetUsername('')
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
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-bold text-black leading-snug">
                    {resolveUserInfoText(item.titleI18n, i18n.language)}
                  </p>
                  <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                    {item.audience === 'user' && item.targetUsername
                      ? `@${item.targetUsername}`
                      : t('notifications.infoBlocks.audienceAll')}
                  </span>
                </div>
                <InlineConfirm
                  label={t('common.delete')}
                  confirmLabel={t('common.confirmDelete')}
                  onConfirm={() => void handleDelete(item.id)}
                  className="flex-shrink-0"
                />
              </div>
              <p className="text-xs text-muted whitespace-pre-wrap line-clamp-4">
                {resolveUserInfoText(item.bodyI18n, i18n.language)}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-card border border-border p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {t('notifications.infoBlocks.addNew')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAudience('all')}
              className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                audience === 'all' ? 'bg-black text-white border-black' : 'bg-surface text-muted border-border'
              }`}
            >
              {t('notifications.send.modeBroadcast')}
            </button>
            <button
              type="button"
              onClick={() => setAudience('user')}
              className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                audience === 'user' ? 'bg-black text-white border-black' : 'bg-surface text-muted border-border'
              }`}
            >
              {t('notifications.send.modeSingle')}
            </button>
          </div>
          {audience === 'user' && (
            <input
              value={targetUsername}
              onChange={(e) => setTargetUsername(e.target.value)}
              placeholder={t('notifications.send.usernamePlaceholder')}
              className={inputCls}
            />
          )}

          <div className="rounded-xl border border-border p-3 space-y-3">
            <p className="text-xs font-bold">{t('notifications.infoBlocks.titleField')}</p>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <div key={`title-${lang}`} className="space-y-1">
                <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider">
                  {t(`language.${lang}`)}
                </label>
                <input
                  value={titleDraft[lang]}
                  onChange={(e) => updateTranslatedTitle(lang, e.target.value)}
                  placeholder={t('notifications.send.titlePlaceholder')}
                  className={inputCls}
                />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border p-3 space-y-3">
            <p className="text-xs font-bold">{t('notifications.infoBlocks.bodyField')}</p>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <div key={`body-${lang}`} className="space-y-1">
                <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider">
                  {t(`language.${lang}`)}
                </label>
                <textarea
                  value={bodyDraft[lang]}
                  onChange={(e) => updateTranslatedBody(lang, e.target.value)}
                  placeholder={t('notifications.send.bodyPlaceholder')}
                  rows={3}
                  className={`${inputCls} resize-y min-h-[72px]`}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isSaving || !canSubmit}
            className={`w-full py-2.5 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 transition-all ${
              !isSaving && canSubmit ? 'bg-black text-white active:scale-[0.98]' : 'bg-surface text-muted'
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
