import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface QrScannerProps {
  onTokenRead: (token: string) => void
  autoStart?: boolean
}

const SCANNER_REGION_ID = 'points-qr-scanner-region'

type ScannerState = 'idle' | 'starting' | 'running' | 'denied' | 'error'

export default function QrScanner({ onTokenRead, autoStart = true }: QrScannerProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<ScannerState>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)
  const startedRef = useRef(false)

  const uniqueRegionId = useMemo(
    () => `${SCANNER_REGION_ID}-${Math.random().toString(36).slice(2, 10)}`,
    []
  )

  const stop = async () => {
    if (!scannerRef.current) return
    await scannerRef.current.stop().catch(() => undefined)
    scannerRef.current.clear()
    scannerRef.current = null
    startedRef.current = false
  }

  const start = async () => {
    if (startedRef.current) return
    startedRef.current = true
    setState('starting')
    setErrorText(null)
    try {
      const html5QrcodeModule = await import('html5-qrcode')
      const scanner = new html5QrcodeModule.Html5Qrcode(uniqueRegionId, { verbose: false })
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, aspectRatio: 1 },
        async (decodedText: string) => {
          const token = extractToken(decodedText)
          if (!token) return
          onTokenRead(token)
          await stop()
          setState('idle')
        },
        () => undefined
      )
      setState('running')
    } catch (error) {
      startedRef.current = false
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      if (
        message.includes('permission') ||
        message.includes('denied') ||
        message.includes('notallowed')
      ) {
        setState('denied')
      } else {
        setState('error')
        setErrorText(error instanceof Error ? error.message : t('qr.openCameraFailed', { defaultValue: 'Failed to open camera.' }))
      }
    }
  }

  useEffect(() => {
    if (autoStart) {
      void start()
      return
    }
    void stop()
    setState('idle')
    setErrorText(null)
  }, [autoStart])

  useEffect(() => {
    return () => {
      void stop()
      startedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full max-w-xs mx-auto rounded-2xl overflow-hidden bg-black">
        <div id={uniqueRegionId} className="absolute inset-0 [&>video]:object-cover [&>video]:w-full [&>video]:h-full" />

        {/* Decorative viewfinder frame */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-[68%] aspect-square">
            <span className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-accent rounded-tl-lg" />
            <span className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-accent rounded-tr-lg" />
            <span className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-accent rounded-bl-lg" />
            <span className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-accent rounded-br-lg" />
          </div>
        </div>

        {/* Overlay states */}
        {state !== 'running' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white text-center px-6 gap-3">
            {state === 'starting' && (
              <>
                <div className="w-7 h-7 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <p className="text-xs font-medium text-white/80">{t('qr.startingCamera', { defaultValue: 'Starting camera...' })}</p>
              </>
            )}
            {state === 'idle' && (
              <button
                onClick={() => void start()}
                className="px-4 py-2 rounded-pill bg-white text-black text-xs font-bold active:scale-[0.97] transition-transform"
              >
                {t('qr.enableCamera', { defaultValue: 'Enable camera' })}
              </button>
            )}
            {state === 'denied' && (
              <>
                <p className="text-xs font-semibold">{t('qr.noCameraAccess', { defaultValue: 'No camera access' })}</p>
                <p className="text-[11px] text-white/70 leading-snug">
                  {t('qr.allowCameraHint', { defaultValue: 'Allow camera access in browser settings and try again.' })}
                </p>
                <button
                  onClick={() => {
                    startedRef.current = false
                    void start()
                  }}
                  className="px-4 py-2 rounded-pill bg-white text-black text-xs font-bold"
                >
                  {t('common.tryAgain', { defaultValue: 'Try again' })}
                </button>
              </>
            )}
            {state === 'error' && (
              <>
                <p className="text-xs font-semibold">{t('qr.openCameraFailedTitle', { defaultValue: 'Failed to open camera' })}</p>
                {errorText && <p className="text-[11px] text-white/70 leading-snug break-words">{errorText}</p>}
                <button
                  onClick={() => {
                    startedRef.current = false
                    void start()
                  }}
                  className="px-4 py-2 rounded-pill bg-white text-black text-xs font-bold"
                >
                  {t('common.retry', { defaultValue: 'Retry' })}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function extractToken(text: string): string | null {
  const patterns = [
    /\/api\/points\/qr\/([^/?#\s]+)/,
    /\/points\/qr\/([^/?#\s]+)/,
    /token=([^&\s]+)/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1]
  }
  if (/^[a-zA-Z0-9_-]{8,}$/.test(text.trim())) return text.trim()
  return null
}
