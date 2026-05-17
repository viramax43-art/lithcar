import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { ArrowLeft, Phone, Calendar, Clock, NavigationArrow, Star, Users } from '@phosphor-icons/react'
import type { Driver, RideRequest } from '../../types'
import { deleteRequest, getRequestById, listDrivers, updateRequest } from '../../lib/backend'
import LithuanianPlate from '../../components/LithuanianPlate'
import { showOnMapHref } from '../../lib/navigation'

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Ожидает подтверждения', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  grouped: { label: 'Группировка', color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  assigned: { label: 'Водитель назначен', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  en_route_to_pickup: { label: 'Водитель едет к вам', color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' },
  awaiting_passenger: { label: 'Водитель на месте', color: '#F97316', bg: 'rgba(249,115,22,0.1)' },
  in_progress: { label: 'В пути', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  completed: { label: 'Поездка завершена', color: '#858585', bg: 'rgba(133,133,133,0.1)' },
}

const REQUEST_POLL_MS = 10_000

const iconA = L.divIcon({ className: '', html: '<div class="marker-a">A</div>', iconSize: [36, 36], iconAnchor: [18, 18] })
const iconB = L.divIcon({ className: '', html: '<div class="marker-b">B</div>', iconSize: [36, 36], iconAnchor: [18, 18] })
const iconDriver = L.divIcon({ className: '', html: '<div class="marker-driver"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [request, setRequest] = useState<RideRequest | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const requestData = await getRequestById(id)
        if (!cancelled) setRequest(requestData)
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить заявку.')
      } finally {
        if (!cancelled) setLoading(false)
      }
      try {
        const driversData = await listDrivers(false, { limit: 200, offset: 0 })
        if (!cancelled) setDrivers(driversData.items)
      } catch {
        if (!cancelled) setDrivers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // Live polling while ride is active.
  useEffect(() => {
    if (!id || !request) return
    if (request.status === 'completed') return
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const fresh = await getRequestById(id)
          setRequest(fresh)
          const driversData = await listDrivers(false, { limit: 200, offset: 0 })
          setDrivers(driversData.items)
        } catch {
          // ignore transient polling errors
        }
      })()
    }, REQUEST_POLL_MS)
    return () => window.clearInterval(timer)
  }, [id, request?.status])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <p className="text-muted">Загрузка...</p>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <p className="text-muted">{errorMessage || 'Заявка не найдена'}</p>
      </div>
    )
  }

  const driver = request.driverId ? drivers.find((d) => d.id === request.driverId) : null
  const status = STATUS_MAP[request.status] || STATUS_MAP.pending
  const dt = new Date(request.dateTime)
  const dateStr = dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

  const center: [number, number] = [
    (request.from.latlng.lat + request.to.latlng.lat) / 2,
    (request.from.latlng.lng + request.to.latlng.lng) / 2,
  ]

  const bounds = L.latLngBounds(
    [request.from.latlng.lat, request.from.latlng.lng],
    [request.to.latlng.lat, request.to.latlng.lng]
  )

  return (
    <div className="min-h-[100dvh] bg-white">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 h-14 bg-white/90 backdrop-blur-md border-b border-border/50">
        <button onClick={() => navigate('/requests')} className="p-1">
          <ArrowLeft size={22} weight="bold" />
        </button>
        <h1 className="text-base font-bold flex-1">Заявка</h1>
        <span
          className="text-xs font-bold px-3 py-1 rounded-pill"
          style={{ color: status.color, background: status.bg }}
        >
          {status.label}
        </span>
      </header>

      {/* Map */}
      <div className="h-64 w-full">
        <MapContainer
          center={center}
          zoom={12}
          bounds={bounds}
          boundsOptions={{ padding: [40, 40] }}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          <Marker position={[request.from.latlng.lat, request.from.latlng.lng]} icon={iconA} />
          <Marker position={[request.to.latlng.lat, request.to.latlng.lng]} icon={iconB} />

          <Polyline
            positions={[
              [request.from.latlng.lat, request.from.latlng.lng],
              [request.to.latlng.lat, request.to.latlng.lng],
            ]}
            pathOptions={{ color: '#000', weight: 3, dashArray: '10, 10', opacity: 0.7 }}
          />

          {driver?.currentLocation && (
            <Marker
              position={[driver.currentLocation.lat, driver.currentLocation.lng]}
              icon={iconDriver}
            />
          )}
        </MapContainer>
      </div>

      {/* Content */}
      <div className="px-5 py-5 space-y-5">
        {request.status === 'pending' && (
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const nextName = window.prompt('Имя пассажира', request.passengerName)
                if (!nextName || !nextName.trim()) return
                const nextPhone = window.prompt('Телефон', request.passengerPhone)
                if (!nextPhone || !nextPhone.trim()) return
                const nextDateTime = window.prompt('Дата и время (ISO, YYYY-MM-DDTHH:mm)', request.dateTime.slice(0, 16))
                if (!nextDateTime || !nextDateTime.trim()) return
                setIsSaving(true)
                setErrorMessage(null)
                try {
                  const updated = await updateRequest(request.id, {
                    passengerName: nextName.trim(),
                    passengerPhone: nextPhone.trim(),
                    from: request.from,
                    to: request.to,
                    dateTime: nextDateTime.trim(),
                  })
                  setRequest(updated)
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить заявку.')
                } finally {
                  setIsSaving(false)
                }
              }}
              disabled={isSaving}
              className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold"
            >
              {isSaving ? 'Сохраняем...' : 'Редактировать'}
            </button>
            <button
              onClick={async () => {
                const confirmed = window.confirm('Удалить заявку?')
                if (!confirmed) return
                setIsSaving(true)
                setErrorMessage(null)
                try {
                  await deleteRequest(request.id)
                  navigate('/requests')
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить заявку.')
                } finally {
                  setIsSaving(false)
                }
              }}
              disabled={isSaving}
              className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-semibold"
            >
              Удалить
            </button>
          </div>
        )}
        {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

        {/* Route card */}
        <div className="bg-surface rounded-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1 pt-1">
              <div className="w-3 h-3 rounded-full bg-point-a" />
              <div className="w-px h-8 bg-border" />
              <div className="w-3 h-3 rounded-full bg-point-b" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted mb-0.5">Откуда</p>
              <p className="text-sm font-semibold text-black mb-3">{request.from.address}</p>
              <p className="text-xs text-muted mb-0.5">Куда</p>
              <p className="text-sm font-semibold text-black">{request.to.address}</p>
            </div>
          </div>
        </div>

        {/* Date/Time */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-muted" />
            <span className="text-sm font-medium">{dateStr}</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-muted" />
            <span className="text-sm font-medium">{timeStr}</span>
          </div>
        </div>

        {/* Driver card */}
        {driver ? (
          <div className="bg-black text-white rounded-card overflow-hidden">
            <div className="px-5 pt-5 pb-4 flex items-center gap-4">
              {driver.photoUrl ? (
                <img
                  src={driver.photoUrl}
                  alt={driver.name}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-white/15 flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🚗</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Ваш водитель</p>
                <p className="text-lg font-extrabold truncate">{driver.name}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs">
                  <span className="inline-flex items-center gap-0.5 font-bold text-amber-400">
                    <Star size={12} weight="fill" /> {driver.rating.toFixed(1)}
                  </span>
                  <span className="text-white/30">·</span>
                  <span className="text-white/60 inline-flex items-center gap-1">
                    <Users size={12} /> {driver.seatsCount ?? 4} мест
                  </span>
                </div>
              </div>
            </div>

            {/* Vehicle band — car info + plate */}
            <div className="mx-5 mb-4 rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Автомобиль</p>
                <p className="text-sm font-bold truncate">
                  {[driver.carBrand, driver.carModel].filter(Boolean).join(' ')}
                </p>
                {driver.vehicleColor && (
                  <p className="text-[11px] text-white/60 truncate">{driver.vehicleColor}</p>
                )}
              </div>
              <LithuanianPlate value={driver.carPlate} size="md" />
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <a
                href={`tel:${driver.phone}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/10 rounded-xl text-sm font-semibold hover:bg-white/20 transition-colors active:scale-[0.98]"
              >
                <Phone size={16} weight="fill" /> Позвонить
              </a>
              {driver.currentLocation && (
                <a
                  href={showOnMapHref(driver.currentLocation, `Водитель · ${driver.name}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-accent text-black rounded-xl text-sm font-extrabold hover:bg-accent/90 transition-colors active:scale-[0.98]"
                >
                  <NavigationArrow size={16} weight="fill" /> На карте
                </a>
              )}
            </div>

            {driver.isOnline && driver.currentLocation && (
              <div className="px-5 pb-4 -mt-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-[11px] text-white/60">Водитель онлайн · геолокация доступна</span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-surface rounded-card p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-white border border-border flex items-center justify-center mx-auto mb-3">
              <span className="text-xl">🚗</span>
            </div>
            <p className="text-sm font-bold">Ищем водителя</p>
            <p className="text-xs text-muted mt-1">Мы уведомим вас, как только водитель будет назначен</p>
          </div>
        )}

        {/* Passenger info */}
        <div className="bg-surface rounded-card p-4 space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Пассажир</p>
          <p className="text-sm font-semibold">{request.passengerName}</p>
          <p className="text-sm text-muted">{request.passengerPhone}</p>
        </div>
      </div>
    </div>
  )
}
