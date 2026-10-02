import { useCallback, useEffect, useState } from 'react'
import { Car, ShieldCheck, User, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import {
  adjustPassengerPoints,
  getUserDossier,
  type PointsTxnBrief,
  type RideBrief,
  type UserDossier,
} from '../../../infrastructure/api/adminApi'
import RatingBadge from '../../../components/RatingBadge'
import { formatDateTime, parseApiDateTime } from '../../../i18n/dateTime'
import { inputCls } from './AdminSidebarShared'

const RIDE_STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает',
  grouped: 'Сгруппирована',
  assigned: 'Назначена',
  en_route_to_pickup: 'Едет к пассажиру',
  awaiting_passenger: 'Ждёт пассажира',
  in_progress: 'В пути',
  completed: 'Завершена',
}

const TXN_TYPE_LABEL: Record<string, string> = {
  driver_qr_top_up: 'Пополнение QR водителя',
  ride_booking_debit: 'Списание за поездку',
  card_purchase: 'Покупка карты',
  user_transfer_out: 'Перевод (исходящий)',
  user_transfer_in: 'Перевод (входящий)',
  admin_adjustment: 'Корректировка админом',
}

function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation()
  const label =
    role === 'driver'
      ? t('admin.dossier.roleDriver', { defaultValue: 'Водитель' })
      : role === 'admin'
        ? t('admin.dossier.roleAdmin', { defaultValue: 'Админ' })
        : role === 'moderator'
          ? t('admin.dossier.roleModerator', { defaultValue: 'Модератор' })
          : t('admin.dossier.rolePassenger', { defaultValue: 'Пассажир' })
  const Icon = role === 'driver' ? Car : role === 'passenger' ? User : ShieldCheck
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface text-[11px] font-semibold text-muted">
      <Icon size={12} />
      {label}
    </span>
  )
}

function RideRow({ ride }: { ride: RideBrief }) {
  return (
    <div className="py-2 border-b border-border/50 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold">#{ride.rideNumber}</span>
        <span className="text-[11px] text-muted">{RIDE_STATUS_LABEL[ride.status] ?? ride.status}</span>
      </div>
      <p className="text-xs text-muted mt-0.5 truncate">
        {ride.fromAddress} → {ride.toAddress}
      </p>
      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted">
        <span>{formatDateTime(parseApiDateTime(ride.dateTime))}</span>
        {typeof ride.quotedPoints === 'number' && <span>{ride.quotedPoints} pt</span>}
      </div>
    </div>
  )
}

function TxnRow({ txn }: { txn: PointsTxnBrief }) {
  const date = parseApiDateTime(txn.createdAt)
  const label = TXN_TYPE_LABEL[txn.transactionType] ?? txn.transactionType
  const sign = txn.amount > 0 ? '+' : ''
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-semibold truncate">{label}</p>
        <p className="text-[11px] text-muted">{isNaN(date.getTime()) ? txn.createdAt : formatDateTime(date)}</p>
      </div>
      <span className={`text-xs font-bold ${txn.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {sign}
        {txn.amount}
      </span>
    </div>
  )
}

export function AdminUserDossierModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [dossier, setDossier] = useState<UserDossier | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [delta, setDelta] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDossier(await getUserDossier(userId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const applyPoints = async (payload: { delta?: number; absolute?: number }) => {
    setSaving(true)
    try {
      await adjustPassengerPoints(userId, payload)
      setDelta('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[3600] bg-black/55 flex flex-col items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <p className="text-lg font-extrabold tracking-tight truncate">
              {userId}
              {dossier?.username ? <span className="text-muted font-semibold text-sm"> @{dossier.username}</span> : null}
            </p>
            {dossier ? (
              <div className="flex items-center gap-2 mt-1">
                <RoleBadge role={dossier.role} />
                <RatingBadge rating={dossier.rating ?? 5} ratingCount={dossier.ratingCount} size="sm" />
              </div>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 -m-1 flex items-center justify-center rounded-lg hover:bg-surface transition-colors flex-shrink-0"
            title={t('common.close', { defaultValue: 'Закрыть' })}
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted text-center py-10">{t('common.loading', { defaultValue: 'Загрузка…' })}</p>
        ) : error ? (
          <p className="text-sm text-red-600 text-center py-10 px-4">{error}</p>
        ) : dossier ? (
          <div className="p-4 space-y-4">
            <div className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{t('admin.dossier.points', { defaultValue: 'Баланс поинтов' })}</span>
                <span className="text-lg font-extrabold">{dossier.pointsBalance} pt</span>
              </div>
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
                  disabled={saving}
                  className="px-3 py-2 rounded-pill bg-black text-white text-xs font-bold disabled:opacity-50"
                  onClick={async () => {
                    const value = parseInt(delta, 10)
                    if (!Number.isFinite(value) || value === 0) return
                    await applyPoints({ delta: value })
                  }}
                >
                  {t('common.apply', { defaultValue: 'Применить' })}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  className="px-3 py-2 rounded-pill bg-white border border-border text-xs font-bold disabled:opacity-50"
                  onClick={() => applyPoints({ absolute: 100 })}
                >
                  {t('admin.dossier.give100', { defaultValue: 'Выдать 100' })}
                </button>
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-xl border border-border p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted">{t('admin.dossier.language', { defaultValue: 'Язык' })}</p>
                <p className="font-bold mt-0.5 uppercase">{dossier.language}</p>
              </div>
              <div className="rounded-xl border border-border p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted">{t('admin.dossier.registered', { defaultValue: 'Регистрация' })}</p>
                <p className="font-bold mt-0.5">{formatDateTime(parseApiDateTime(dossier.createdAt))}</p>
              </div>
              <div className="rounded-xl border border-border p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted">{t('admin.dossier.onboarding', { defaultValue: 'Онбординг' })}</p>
                <p className="font-bold mt-0.5">{dossier.onboardingCompleted ? '✓' : '—'}</p>
              </div>
              <div className="rounded-xl border border-border p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted">{t('admin.dossier.blocks', { defaultValue: 'Блокировки' })}</p>
                <p className="font-bold mt-0.5">
                  {dossier.blockingCount}/{dossier.blockedByCount}
                </p>
              </div>
            </div>

            {/* Driver profile */}
            {dossier.driver ? (
              <div className="rounded-xl border border-border p-3 space-y-1.5">
                <p className="text-sm font-bold">{t('admin.dossier.driver', { defaultValue: 'Профиль водителя' })}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <p>
                    <span className="text-muted">{t('common.name', { defaultValue: 'Имя' })}:</span>{' '}
                    <span className="font-semibold">{dossier.driver.name}</span>
                  </p>
                  <p>
                    <span className="text-muted">{t('admin.dossier.car', { defaultValue: 'Авто' })}:</span>{' '}
                    <span className="font-semibold">
                      {dossier.driver.carBrand} {dossier.driver.carModel}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted">{t('admin.dossier.plate', { defaultValue: 'Номер' })}:</span>{' '}
                    <span className="font-semibold">{dossier.driver.carPlate}</span>
                  </p>
                  <p>
                    <span className="text-muted">{t('admin.dossier.online', { defaultValue: 'Статус' })}:</span>{' '}
                    <span className={`font-semibold ${dossier.driver.isOnline ? 'text-green-600' : 'text-muted'}`}>
                      {dossier.driver.isOnline
                        ? t('admin.dossier.onlineYes', { defaultValue: 'онлайн' })
                        : t('admin.dossier.onlineNo', { defaultValue: 'офлайн' })}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted">{t('admin.dossier.rating', { defaultValue: 'Рейтинг' })}:</span>{' '}
                    <span className="font-semibold">{dossier.driver.rating}</span>
                  </p>
                  <p>
                    <span className="text-muted">{t('admin.dossier.seats', { defaultValue: 'Мест' })}:</span>{' '}
                    <span className="font-semibold">{dossier.driver.seatsCount}</span>
                  </p>
                </div>
              </div>
            ) : null}

            {/* Rides as passenger */}
            <div className="rounded-xl border border-border p-3">
              <p className="text-sm font-bold mb-1">
                {t('admin.dossier.ridesPassenger', { defaultValue: 'Поездки (пассажир)' })} · {dossier.ridesAsPassenger.length}
              </p>
              {dossier.ridesAsPassenger.length === 0 ? (
                <p className="text-xs text-muted">{t('admin.dossier.empty', { defaultValue: 'Нет данных' })}</p>
              ) : (
                dossier.ridesAsPassenger.map((r) => <RideRow key={r.id} ride={r} />)
              )}
            </div>

            {/* Rides as driver */}
            {dossier.driver ? (
              <div className="rounded-xl border border-border p-3">
                <p className="text-sm font-bold mb-1">
                  {t('admin.dossier.ridesDriver', { defaultValue: 'Поездки (водитель)' })} · {dossier.ridesAsDriver.length}
                </p>
                {dossier.ridesAsDriver.length === 0 ? (
                  <p className="text-xs text-muted">{t('admin.dossier.empty', { defaultValue: 'Нет данных' })}</p>
                ) : (
                  dossier.ridesAsDriver.map((r) => <RideRow key={r.id} ride={r} />)
                )}
              </div>
            ) : null}

            {/* Points transactions */}
            <div className="rounded-xl border border-border p-3">
              <p className="text-sm font-bold mb-1">
                {t('admin.dossier.transactions', { defaultValue: 'Операции с поинтами' })} · {dossier.pointsTransactions.length}
              </p>
              {dossier.pointsTransactions.length === 0 ? (
                <p className="text-xs text-muted">{t('admin.dossier.empty', { defaultValue: 'Нет данных' })}</p>
              ) : (
                dossier.pointsTransactions.map((txn) => <TxnRow key={txn.id} txn={txn} />)
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}


