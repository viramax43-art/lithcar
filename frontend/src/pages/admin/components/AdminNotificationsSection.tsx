import { useState } from 'react'
import { PaperPlaneTilt } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { sendAdminNotification } from '../../../infrastructure/api/notificationsApi'
import type { Driver } from '../../../types'
import { inputCls, Section } from './AdminSidebarShared'

type AdminNotificationsSectionProps = {
  drivers: Driver[]
  canSend: boolean
  onSent?: () => void
}

export function AdminNotificationsSection({ drivers, canSend, onSent }: AdminNotificationsSectionProps) {
  const { t } = useTranslation()
  const [pool, setPool] = useState<'passenger' | 'driver'>('passenger')
  const [mode, setMode] = useState<'broadcast' | 'single'>('broadcast')
  const [recipientId, setRecipientId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sendTelegram, setSendTelegram] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSend = async () => {
    if (!canSend || !title.trim() || !body.trim()) return
    if (mode === 'single' && !recipientId.trim()) {
      setErrorMessage(t('notifications.send.recipientRequired'))
      return
    }
    setIsSending(true)
    setErrorMessage(null)
    setFeedback(null)
    try {
      const result = await sendAdminNotification({
        pool,
        mode,
        recipientId: mode === 'single' ? recipientId.trim() : undefined,
        title: title.trim(),
        body: body.trim(),
        sendTelegram,
      })
      setFeedback(t('notifications.send.success', { count: result.sentCount }))
      setTitle('')
      setBody('')
      setRecipientId('')
      onSent?.()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setIsSending(false)
    }
  }

  if (!canSend) return null

  return (
    <Section title={t('notifications.send.title')}>
      <div className="space-y-3">
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

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('broadcast')}
            className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
              mode === 'broadcast' ? 'bg-white shadow-sm text-black border-border' : 'bg-surface text-muted border-border'
            }`}
          >
            {t('notifications.send.modeBroadcast')}
          </button>
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
              mode === 'single' ? 'bg-white shadow-sm text-black border-border' : 'bg-surface text-muted border-border'
            }`}
          >
            {t('notifications.send.modeSingle')}
          </button>
        </div>

        {mode === 'single' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {pool === 'passenger' ? t('notifications.send.recipientUserId') : t('notifications.send.recipientDriver')}
            </label>
            {pool === 'driver' ? (
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className={inputCls}
              >
                <option value="">{t('notifications.send.selectDriver')}</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} ({driver.carPlate})
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                placeholder={t('notifications.send.userIdPlaceholder')}
                className={inputCls}
              />
            )}
          </div>
        )}

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

        <label className="flex items-center gap-2 text-xs font-semibold text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={sendTelegram}
            onChange={(e) => setSendTelegram(e.target.checked)}
            className="rounded border-border"
          />
          {t('notifications.send.alsoTelegram')}
        </label>

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={isSending || !title.trim() || !body.trim()}
          className={`w-full py-3 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 transition-all ${
            !isSending && title.trim() && body.trim()
              ? 'bg-black text-white active:scale-[0.98]'
              : 'bg-surface text-muted'
          }`}
        >
          <PaperPlaneTilt size={16} weight="bold" />
          {isSending ? t('notifications.send.sending') : t('notifications.send.submit')}
        </button>

        {feedback && <p className="text-xs font-medium text-green-700">{feedback}</p>}
        {errorMessage && <p className="text-xs font-medium text-red-600">{errorMessage}</p>}
      </div>
    </Section>
  )
}
