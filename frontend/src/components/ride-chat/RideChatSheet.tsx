import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ChatCircleDots, PaperPlaneRight, X } from '@phosphor-icons/react'

import { hapticSelection } from '../../lib/telegram'
import type { RideChatMessage } from '../../types'
import { useRideChat, type RideChatRole } from './useRideChat'

interface RideChatSheetProps {
  rideId: string | null
  role: RideChatRole
  open: boolean
  onClose: () => void
}

interface QuickReply {
  code: string
  labelKey: string
}

const QUICK_REPLIES: Record<RideChatRole, QuickReply[]> = {
  passenger: [
    { code: 'ready', labelKey: 'rideChat.quick.ready' },
    { code: 'where_are_you', labelKey: 'rideChat.quick.whereAreYou' },
    { code: 'at_entrance', labelKey: 'rideChat.quick.atEntrance' },
    { code: 'thanks', labelKey: 'rideChat.quick.thanks' },
  ],
  driver: [
    { code: 'on_the_way', labelKey: 'rideChat.quick.onTheWay' },
    { code: 'arrived_here', labelKey: 'rideChat.quick.arrivedHere' },
    { code: 'cannot_find', labelKey: 'rideChat.quick.cannotFind' },
    { code: 'thanks', labelKey: 'rideChat.quick.thanks' },
  ],
}

function formatMessageTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function MessageRow({ message }: { message: RideChatMessage }) {
  const { t } = useTranslation()

  if (message.senderType === 'system') {
    return (
      <p className="text-center text-[11px] text-muted bg-white/70 rounded-pill px-3 py-1.5 mx-auto w-fit max-w-[85%]">
        {message.body}
      </p>
    )
  }

  const isQuick = message.kind === 'quick_reply'
  const bubbleClass = message.mine
    ? 'bg-black text-white rounded-2xl rounded-br-sm'
    : 'bg-white text-black rounded-2xl rounded-bl-sm shadow-card'
  const quickClass = message.mine
    ? 'bg-black/90 text-white rounded-pill'
    : 'bg-white text-black rounded-pill shadow-card'

  return (
    <div className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] px-3.5 py-2 ${isQuick ? quickClass : bubbleClass}`}>
        {!message.mine && !isQuick && (
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-70 mb-0.5">
            {message.senderName}
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap break-words leading-snug">{message.body}</p>
        <p className={`text-[10px] mt-1 ${message.mine ? 'text-white/60 text-right' : 'text-muted'}`}>
          {formatMessageTime(message.createdAt)}
          {message.mine && message.readByOthers
            ? ` · ${t('rideChat.read', { defaultValue: 'прочитано' })}`
            : ''}
        </p>
      </div>
    </div>
  )
}

/**
 * Шит чата поездки: водитель и все попутчики одной машины.
 *
 * Системные записи (статусы, неявка, «пассажир на месте») показываются как «история поездки»,
 * поэтому обе стороны всегда видят, что происходило и когда.
 */
export default function RideChatSheet({ rideId, role, open, onClose }: RideChatSheetProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const {
    messages,
    canSend,
    closedReason,
    participants,
    isLoading,
    isSending,
    errorMessage,
    send,
    markRead,
  } = useRideChat({ rideId, role, enabled: open })

  useEffect(() => {
    if (!open) {
      setDraft('')
      return
    }
    void markRead()
  }, [open, markRead])

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length, open])

  const participantsLabel = useMemo(
    () => participants.map((item) => item.name).filter(Boolean).join(' · '),
    [participants],
  )
  const passengerCount = useMemo(
    () => participants.filter((item) => item.type === 'passenger').length,
    [participants],
  )

  const closedMessage = closedReason === 'ride_closed'
    ? t('rideChat.closedRide', { defaultValue: 'Чат закрыт: поездка завершена.' })
    : closedReason
      ? t('rideChat.closedNotAssigned', { defaultValue: 'Чат откроется после назначения водителя.' })
      : null

  if (!open || typeof document === 'undefined') return null

  const handleSend = async (body: string, quick?: string) => {
    const sent = await send(body, quick)
    if (sent) setDraft('')
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[5200] bg-black/40" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-label={t('rideChat.title', { defaultValue: 'Чат поездки' })}
        className="fixed left-0 right-0 bottom-0 z-[5201] bg-white rounded-t-card shadow-card flex flex-col"
        style={{ maxHeight: '86dvh', paddingBottom: 'var(--app-user-safe-bottom)' }}
      >
        <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border/40">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-black flex items-center gap-1.5">
              <ChatCircleDots size={16} weight="fill" />
              {t('rideChat.title', { defaultValue: 'Чат поездки' })}
            </p>
            {passengerCount > 0 && (
              <p className="text-[11px] font-bold text-black/70 mt-0.5">
                {t('rideChat.groupTitle', {
                  count: passengerCount,
                  defaultValue: `Групповой чат: водитель и ${passengerCount} попутчик(ов)`,
                })}
              </p>
            )}
            {participantsLabel && (
              <p className="text-xs text-muted mt-0.5 truncate">{participantsLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: 'Закрыть' })}
            className="min-h-[36px] min-w-[36px] rounded-lg text-muted hover:text-black active:bg-surface flex items-center justify-center"
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-surface/40">
          {isLoading && messages.length === 0 && (
            <p className="text-center text-sm text-muted py-6">
              {t('common.loading', { defaultValue: 'Загрузка...' })}
            </p>
          )}
          {!isLoading && messages.length === 0 && (
            <p className="text-center text-sm text-muted py-8">
              {t('rideChat.empty', {
                defaultValue: 'Сообщений пока нет. Напишите водителю или попутчикам.',
              })}
            </p>
          )}
          {messages.map((message) => <MessageRow key={message.id} message={message} />)}
        </div>

        {errorMessage && <p className="px-4 py-2 text-xs text-red-600 bg-red-50">{errorMessage}</p>}
        {closedMessage && <p className="px-4 py-2 text-xs text-muted bg-surface">{closedMessage}</p>}

        {canSend && (
          <div className="border-t border-border/40 px-3 pt-2 pb-3 space-y-2">
            <div className="flex gap-1.5 overflow-x-auto scroll-smooth-y pb-0.5">
              {QUICK_REPLIES[role].map((reply) => (
                <button
                  key={reply.code}
                  type="button"
                  disabled={isSending}
                  onClick={() => {
                    hapticSelection()
                    const label = t(reply.labelKey, { defaultValue: reply.labelKey })
                    void handleSend(label, reply.code)
                  }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-pill bg-surface text-xs font-semibold text-black/80 active:scale-[0.97] disabled:opacity-50"
                >
                  {t(reply.labelKey, { defaultValue: reply.labelKey })}
                </button>
              ))}
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSend(draft)
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={1}
                maxLength={1000}
                placeholder={t('rideChat.placeholder', { defaultValue: 'Сообщение...' })}
                className="flex-1 max-h-28 min-h-[42px] resize-none rounded-card border border-border/70 px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={isSending || draft.trim().length === 0}
                className="h-[42px] w-[42px] rounded-pill bg-accent text-black flex items-center justify-center active:scale-[0.97] disabled:opacity-50"
                aria-label={t('rideChat.send', { defaultValue: 'Отправить' })}
              >
                <PaperPlaneRight size={18} weight="fill" />
              </button>
            </form>
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}
