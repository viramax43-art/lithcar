import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { listBlockedUsersAsDriver, unblockUserAsDriver } from '../../../lib/backend'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import CabinetRoleBanner from '../../../components/CabinetRoleBanner'
import type { BlockedUser } from '../../../types'

interface DriverBlockedListProps {
  onClose: () => void
}

export default function DriverBlockedList({ onClose }: DriverBlockedListProps) {
  const { t } = useTranslation()
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null)

  useEscapeClose(true, onClose)

  const loadBlocked = useCallback(async () => {
    setIsLoading(true)
    try {
      const page = await listBlockedUsersAsDriver()
      setBlockedUsers(page.items.map((item) => ({
        userId: item.userId,
        username: item.username,
        displayName: item.displayName,
        blockedAt: item.blockedAt,
        blockedAtLocal: item.blockedAtLocal,
      })))
    } catch {
      setBlockedUsers([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBlocked()
  }, [loadBlocked])

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-slide-in-right">
      <header
        className="flex-shrink-0 bg-white border-b border-border/50"
        style={{ paddingTop: 'var(--app-safe-area-top-total)' }}
      >
        <CabinetRoleBanner variant="inline" />
        <div className="flex items-center gap-3 px-3 h-14 w-full max-w-2xl mx-auto">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
          <h1 className="text-base font-extrabold tracking-tight flex-1">
            {t('block.blockedList', { defaultValue: 'Blocked users' })}
          </h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'var(--app-safe-area-bottom-total)' }}>
        <div className="flex flex-col w-full max-w-2xl mx-auto px-5 py-4 space-y-3">
          {isLoading && (
            <p className="text-xs text-muted py-8 text-center">
              {t('common.loading', { defaultValue: 'Loading...' })}
            </p>
          )}
          {!isLoading && blockedUsers.length === 0 && (
            <p className="text-xs text-muted py-8 text-center">
              {t('block.blockedListEmpty', { defaultValue: 'No blocked users' })}
            </p>
          )}
          {blockedUsers.map((user) => (
            <div key={user.userId} className="rounded-xl bg-surface/70 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{user.displayName}</p>
                {user.username && <p className="text-[11px] text-muted truncate">@{user.username}</p>}
              </div>
              <button
                type="button"
                disabled={unblockingUserId === user.userId}
                onClick={() => {
                  void (async () => {
                    setUnblockingUserId(user.userId)
                    try {
                      await unblockUserAsDriver(user.userId)
                      setBlockedUsers((prev) => prev.filter((item) => item.userId !== user.userId))
                    } catch {
                      // ignore
                    } finally {
                      setUnblockingUserId(null)
                    }
                  })()
                }}
                className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-pill border border-border text-xs font-bold text-muted active:bg-surface disabled:opacity-60"
              >
                {unblockingUserId === user.userId
                  ? t('common.loading', { defaultValue: 'Loading...' })
                  : t('block.unblock', { defaultValue: 'Unblock' })}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
