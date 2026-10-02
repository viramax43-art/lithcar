import { useEffect, useState } from 'react'
import { CheckCircle, PaperPlaneTilt, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { ApiError, parseApiErrorCode, transferPoints } from '../lib/backend'
import { hapticNotification, hapticSelection } from '../lib/telegram'
import { useEscapeClose } from '../lib/useEscapeClose'

const TRANSFER_PRESETS = [10, 25, 50, 100]

interface TransferPointsSheetProps {
  onClose: () => void
  /**
   * Called after a successful transfer. `newBalance` is the sender balance returned by the API.
   * Optional — the admin shell has no own balance card to refresh.
   */
  onTransferred?: (points: number, newBalance: number, recipientName: string) => void
  /**
   * Sender balance in points. When omitted (admin / moderator shell) the balance card,
   * the +-/10 steppers cap and the client-side balance limit are hidden and the
   * backend stays the single source of truth.
   */
  currentBalance?: number
  /** Sender user id — blocks a self-transfer client-side. */
  currentUserId?: string
}

/**
 * Shared "send points by Telegram ID" sheet.
 * Used by the passenger Profile and by the admin/moderator panel header so the
 * transfer UX (fields, presets, errors, receipts) is identical in every cabinet.
 */
export default function TransferPointsSheet({
  onClose,
  onTransferred,
  currentBalance,
  currentUserId,
}: TransferPointsSheetProps) {
  const { t } = useTranslation()
  const [recipientUserId, setRecipientUserId] = useState('')
  const [points, setPoints] = useState<number>(25)
  const [stage, setStage] = useState<'form' | 'processing' | 'success'>('form')
  const [transferError, setTransferError] = useState<string | null>(null)
  const [successRecipientName, setSuccessRecipientName] = useState('')
  useEscapeClose(stage !== 'processing', onClose)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const trimmedRecipientId = recipientUserId.trim()
  const balanceCap = currentBalance ?? Number.MAX_SAFE_INTEGER
  const canSubmit =
    stage === 'form' &&
    points >= 1 &&
    trimmedRecipientId.length > 0 &&
    trimmedRecipientId !== currentUserId &&
    points <= balanceCap

  const resolveTransferError = (error: unknown): string => {
    const code = parseApiErrorCode(error)
    if (code === 'self_transfer') {
      return t('profile.transferSelfError', { defaultValue: 'You cannot send points to yourself.' })
    }
    if (code === 'recipient_not_found') {
      return t('profile.transferNotFound', { defaultValue: 'User with this ID was not found.' })
    }
    if (code === 'insufficient_points') {
      return t('profile.transferInsufficient', { defaultValue: 'Not enough points on balance.' })
    }
    if (error instanceof ApiError) {
      return error.message
    }
    if (error instanceof Error) {
      return error.message
    }
    return t('profile.transferFailed', { defaultValue: 'Transfer failed.' })
  }

  const handleTransfer = async () => {
    if (!canSubmit) return
    hapticSelection()
    setStage('processing')
    setTransferError(null)
    try {
      const result = await transferPoints({
        recipientUserId: trimmedRecipientId,
        points,
      })
      hapticNotification('success')
      const recipientName = result.recipientUsername
        ? `@${result.recipientUsername}`
        : result.recipientUserId
      setSuccessRecipientName(recipientName)
      setStage('success')
      onTransferred?.(result.points, result.pointsBalance, recipientName)
    } catch (error) {
      hapticNotification('error')
      setTransferError(resolveTransferError(error))
      setStage('form')
    }
  }

  const headerTitle =
    stage === 'success'
      ? t('profile.transferSuccess', { defaultValue: 'Transfer complete' })
      : t('profile.transferTitle', { defaultValue: 'Send points' })

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={() => stage !== 'processing' && onClose()}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-card shadow-card flex flex-col max-h-[92dvh]"
        style={{ paddingBottom: 'var(--app-user-safe-bottom)' }}
        onClick={(event) => event.stopPropagation()}
      >

        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold tracking-tight">{headerTitle}</p>
            {stage === 'form' && (
              <p className="text-[11px] text-muted">
                {t('profile.transferPointsDesc', { defaultValue: 'Transfer to another user by ID' })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={stage === 'processing'}
            className="w-9 h-9 rounded-pill bg-surface flex items-center justify-center active:scale-[0.95] transition-transform disabled:opacity-40"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-2 overflow-y-auto">
          {stage === 'success' ? (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center">
                <CheckCircle size={40} weight="fill" className="text-accent-dark" />
              </div>
              <div>
                <p className="text-3xl font-extrabold tracking-tight">−{points} pts</p>
                <p className="text-xs text-muted mt-1">
                  {t('profile.transferSent', {
                    name: successRecipientName,
                    defaultValue: `Sent to ${successRecipientName}`,
                  })}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full mt-2 py-3 rounded-2xl bg-black text-white text-sm font-bold active:scale-[0.98] transition-transform"
              >
                {t('common.done', { defaultValue: 'Done' })}
              </button>
            </div>
          ) : stage === 'processing' ? (
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-border border-t-black animate-spin" />
                <PaperPlaneTilt size={26} weight="bold" className="text-black" />
              </div>
              <p className="text-base font-bold">{t('common.loading', { defaultValue: 'Loading...' })}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentBalance !== undefined && (
                <div className="rounded-2xl bg-black text-white p-4 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                    {t('profile.balance', { defaultValue: 'Balance' })}
                  </p>
                  <p className="text-2xl font-extrabold">{currentBalance} pts</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted">
                  {t('profile.transferRecipientId', { defaultValue: 'Recipient ID' })}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={recipientUserId}
                  onChange={(event) => setRecipientUserId(event.target.value)}
                  placeholder={t('profile.transferRecipientId', { defaultValue: 'Recipient ID' })}
                  className="w-full h-12 px-4 rounded-2xl border-[1.5px] border-border bg-surface text-base font-bold font-mono outline-none focus:border-black focus:bg-white transition-colors"
                />
                <p className="text-[10px] text-muted">
                  {t('profile.transferRecipientHint', { defaultValue: 'Telegram user ID from their profile' })}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted">
                  {t('profile.transferAmount', { defaultValue: 'How many points' })}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      setPoints((value) => Math.max(1, value - 10))
                    }}
                    className="w-11 h-11 rounded-xl bg-surface text-lg font-bold active:scale-[0.95] transition-transform flex-shrink-0"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={currentBalance}
                    value={points || ''}
                    onChange={(event) => setPoints(Number(event.target.value) || 0)}
                    className="flex-1 min-w-0 h-11 px-3 rounded-xl border-[1.5px] border-border bg-surface text-center text-base font-bold outline-none focus:border-black focus:bg-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      setPoints((value) => Math.min(balanceCap, value + 10))
                    }}
                    className="w-11 h-11 rounded-xl bg-surface text-lg font-bold active:scale-[0.95] transition-transform flex-shrink-0"
                  >
                    +
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {TRANSFER_PRESETS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={value > balanceCap}
                      onClick={() => {
                        hapticSelection()
                        setPoints(value)
                      }}
                      className={`px-3 py-1.5 rounded-pill text-xs font-bold transition-all disabled:opacity-40 ${
                        points === value ? 'bg-black text-white' : 'bg-surface text-black active:scale-[0.95]'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              {transferError && (
                <p className="text-xs font-medium text-red-600 break-words">{transferError}</p>
              )}

              <button
                onClick={() => void handleTransfer()}
                disabled={!canSubmit}
                className={`w-full h-12 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  canSubmit ? 'bg-black text-white active:scale-[0.98]' : 'bg-surface text-muted cursor-not-allowed'
                }`}
              >
                <PaperPlaneTilt size={16} weight="bold" />
                {t('profile.transferSubmit', { points, defaultValue: `Send ${points} pts` })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

