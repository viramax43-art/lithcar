import { Warning } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_PIN_ANCHOR_Y_FRAC, pinLabelTopCss, pinTopCss } from '../../lib/mapPinAnchor'

interface RoutePointPinOverlayProps {
  visible: boolean
  activeIsFrom: boolean
  isPanning: boolean
  pinOutOfZone: boolean
  isResolving: boolean
  pinAddress: string
  setupHint: string
  pinAnchorYFrac?: number
}

export function RoutePointPinMarkers({
  visible,
  activeIsFrom,
  isPanning,
  pinAnchorYFrac = DEFAULT_PIN_ANCHOR_Y_FRAC,
}: Pick<RoutePointPinOverlayProps, 'visible' | 'activeIsFrom' | 'isPanning' | 'pinAnchorYFrac'>) {
  if (!visible) return null
  const pinTop = pinTopCss(pinAnchorYFrac)
  return (
    <>
      <div
        className={`center-pin ${activeIsFrom ? 'pin-a' : 'pin-b'} ${isPanning ? 'is-panning' : ''}`}
        style={{ top: pinTop }}
      >
        <div className="pin-body">
          <span>{activeIsFrom ? 'A' : 'B'}</span>
        </div>
      </div>
      <div className="center-pin-shadow" style={{ top: pinTop, ...(isPanning ? { width: 22, opacity: 0.45 } : undefined) }} />
    </>
  )
}

export function RoutePointPinLabel({
  visible,
  activeIsFrom,
  pinOutOfZone,
  isResolving,
  pinAddress,
  setupHint,
  pinAnchorYFrac = DEFAULT_PIN_ANCHOR_Y_FRAC,
}: RoutePointPinOverlayProps) {
  const { t } = useTranslation()
  if (!visible) return null

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none max-w-[80vw]"
      style={{ top: pinLabelTopCss(pinAnchorYFrac) }}
    >
      {pinOutOfZone ? (
        <div className="px-3 py-1.5 rounded-pill bg-red-500 text-white text-[11px] font-bold shadow-card inline-flex items-center gap-1.5 animate-fade-in">
          <Warning size={12} weight="fill" />
          {t('passenger.outOfServiceZone', { defaultValue: 'Out of service zone' })}
        </div>
      ) : isResolving ? (
        <div className="px-3 py-1.5 rounded-pill bg-white text-black text-[11px] font-bold shadow-card inline-flex items-center gap-2 border border-black/10 animate-fade-in">
          <span className={`w-3 h-3 rounded-full border-[2px] border-border animate-spin ${activeIsFrom ? 'border-t-point-a' : 'border-t-point-b'}`} />
          <span className="inline-flex items-center gap-0.5">
            {t('passenger.resolvingAddress', { defaultValue: 'Resolving address' })}
            <span className="dot-pulse" style={{ animationDelay: '0ms' }}>.</span>
            <span className="dot-pulse" style={{ animationDelay: '150ms' }}>.</span>
            <span className="dot-pulse" style={{ animationDelay: '300ms' }}>.</span>
          </span>
        </div>
      ) : pinAddress ? (
        <div className={`px-3 py-1.5 rounded-pill text-white text-[11px] font-bold shadow-card truncate max-w-[80vw] animate-fade-in ${activeIsFrom ? 'bg-point-a' : 'bg-point-b'}`}>
          {pinAddress}
        </div>
      ) : (
        <div className={`px-3 py-1.5 rounded-pill text-white text-[11px] font-bold shadow-card max-w-[80vw] text-center leading-snug ${activeIsFrom ? 'bg-point-a' : 'bg-point-b'}`}>
          {setupHint}
        </div>
      )}
    </div>
  )
}
