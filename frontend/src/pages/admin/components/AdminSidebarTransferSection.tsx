import { useState } from 'react'
import { PaperPlaneTilt } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { adjustPassengerPoints } from '../../../infrastructure/api/adminApi'
import { inputCls } from './AdminSidebarShared'
import type { AdminTab } from '../constants'

export function AdminSidebarTransferSection({ activeTab }: { activeTab: AdminTab }) {
  const { t } = useTranslation()
  const [userId, setUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ amount: number; balance: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (activeTab !== 'transfer') return null

  const parsedAmount = Number(amount)
  const canSubmit =
    userId.trim().length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0 && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    const trimmedId = userId.trim()
    const delta = Math.trunc(parsedAmount)
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const updated = await adjustPassengerPoints(trimmedId, {
        delta,
        reason:
          reason.trim() || t('admin.transfer.defaultReason', { defaultValue: 'Перевод от администратора' }),
      })
      setResult({ amount: delta, balance: updated.pointsBalance })
      setAmount('')
      setReason('')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('admin.transfer.failed', { defaultValue: 'Не удалось выполнить перевод.' }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border p-3 space-y-3">
        <div>
          <h3 className="text-sm font-bold">
            {t('admin.transfer.title', { defaultValue: 'Перевод средств' })}
          </h3>
          <p className="text-[11px] text-muted mt-0.5">
            {t('admin.transfer.hint', {
              defaultValue: 'Начислите поинты пользователю по ID его профиля (Telegram ID).',
            })}
          </p>
        </div>

        <label className="block text-sm">
          <span className="font-semibold">
            {t('admin.transfer.userId', { defaultValue: 'ID профиля (Telegram ID)' })}
          </span>
          <input
            className={inputCls + ' mt-1 font-mono'}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={t('admin.transfer.userIdPlaceholder', { defaultValue: 'Например, 123456789' })}
            inputMode="numeric"
            autoComplete="off"
          />
        </label>

        <label className="block text-sm">
          <span className="font-semibold">
            {t('admin.transfer.amount', { defaultValue: 'Сумма (поинты)' })}
          </span>
          <input
            type="number"
            min={1}
            step={1}
            className={inputCls + ' mt-1'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            inputMode="numeric"
          />
        </label>

        <label className="block text-sm">
          <span className="font-semibold">
            {t('admin.transfer.reason', { defaultValue: 'Комментарий (необязательно)' })}
          </span>
          <input
            className={inputCls + ' mt-1'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder={t('admin.transfer.reasonPlaceholder', { defaultValue: 'Например, компенсация' })}
            autoComplete="off"
          />
        </label>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-pill bg-black text-white text-sm font-bold transition-all hover:bg-zinc-800 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PaperPlaneTilt size={16} weight="fill" />
          {submitting
            ? t('admin.transfer.submitting', { defaultValue: 'Перевод…' })
            : t('admin.transfer.submit', { defaultValue: 'Перевести' })}
        </button>

        {result ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-xs text-emerald-800">
            {t('admin.transfer.success', {
              defaultValue: 'Переведено {{amount}} поинтов. Новый баланс: {{balance}}.',
              amount: result.amount,
              balance: result.balance,
            })}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
