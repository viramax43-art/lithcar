import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Html5Qrcode } from 'html5-qrcode'

interface QrScannerProps {
  onTokenRead: (token: string) => void
  active?: boolean
}

const SCANNER_REGION_ID = 'points-qr-scanner-region'

type ScannerState = 'idle' | 'starting' | 'running' | 'denied' | 'error'

let scannerModulePromise: Promise<typeof import('html5-qrcode')> | null = null

function loadScannerModule() {
  if (!scannerModulePromise) {
    scannerModulePromise = import('html5-qrcode').catch((error) => {
      scannerModulePromise = null
      throw error
    })
  }
  return scannerModulePromise
}

export default function QrScanner({ onTokenRead, active = true }: QrScannerProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<ScannerState>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const startedRef = useRef(false)
  const operationRef = useRef(0)

  const uniqueRegionId = useMemo(
    () => `${SCANNER_REGION_ID}-${Math.random().toString(36).slice(2, 10)}`,
    [],
  )

  const stop = async () => {
    operationRef.current += 1
    const scanner = scannerRef.current
    scannerRef.current = null
    startedRef.current = false
    if (!scanner) return
    await scanner.stop().catch(() => undefined)
    try {
      scanner.clear()
    } catch {
      // The scanner may already be cleared after a failed or interrupted start.
    }
  }

  const start = async (attempt = 0) => {
    if (startedRef.current) return
    const operation = ++operationRef.current
    startedRef.current = true
    setState('starting')
    setErrorText(null)
    let scanner: Html5Qrcode | null = null
    try {
      const html5QrcodeModule = await loadScannerModule()
      if (operation !== operationRef.current) return
      scanner = new html5QrcodeModule.Html5Qrcode(uniqueRegionId, { verbose: false })
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
        () => undefined,
      )
      if (operation !== operationRef.current) {
        await scanner.stop().catch(() => undefined)
        try {
          scanner.clear()
        } catch {
          // The scanner may already be cleared while the camera was starting.
        }
        return
      }
      setState('running')
    } catch (error) {
      if (scannerRef.current === scanner) scannerRef.current = null
      if (scanner) {
        await scanner.stop().catch(() => undefined)
        try {
          scanner.clear()
        } catch {
          // Failed starts can leave the scanner without an initialized element.
        }
      }
      if (operation !== operationRef.current) return
      startedRef.current = false

      // Android WebView can finish the runtime permission flow by rejecting
      // the first getUserMedia call. Retry once internally so one button tap
      // is enough after the user grants camera access.
      if (attempt === 0 && active) {
        setState('starting')
        await new Promise((resolve) => window.setTimeout(resolve, 350))
        if (operation === operationRef.current && active) {
          void start(1)
        }
        return
      }

      const message = error instanceof Error ? error.message.toLowerCase() : ''
      if (
        message.includes('permission') ||
        message.includes('denied') ||
        message.includes('notallowed')
      ) {
        setState('denied')
      } else {
        setState('error')
        setErrorText(
          error instanceof Error
            ? error.message
            : t('qr.openCameraFailed', { defaultValue: 'Failed to open camera.' }),
        )
      }
    }
  }

  useEffect(() => {
    if (active) {
      // Preload the scanner while the drawer opens so the first user tap can
      // request the camera immediately instead of being consumed by import().
      void loadScannerModule().catch(() => undefined)
      return
    }
    void stop()
    setState('idle')
    setErrorText(null)
  }, [active])

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
        <div
          id={uniqueRegionId}
          className="absolute inset-0 [&>video]:object-cover [&>video]:w-full [&>video]:h-full"
        />

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
                <p className="text-xs font-medium text-white/80">
                  {t('qr.startingCamera', { defaultValue: 'Starting camera...' })}
                </p>
              </>
            )}
            {state === 'idle' && (
              <button
                onClick={() => void start()}
                className="min-h-11 px-5 py-2 rounded-pill bg-white text-black text-xs font-bold active:scale-[0.97] transition-transform"
              >
                {t('qr.enableCamera', { defaultValue: 'Enable camera' })}
              </button>
            )}
            {state === 'denied' && (
              <>
                <p className="text-xs font-semibold">
                  {t('qr.noCameraAccess', { defaultValue: 'No camera access' })}
                </p>
                <p className="text-[11px] text-white/70 leading-snug">
                  {t('qr.allowCameraHint', {
                    defaultValue: 'Allow camera access in browser settings and try again.',
                  })}
                </p>
                <button
                  onClick={() => {
                    startedRef.current = false
                    void start()
                  }}
                  className="min-h-11 px-5 py-2 rounded-pill bg-white text-black text-xs font-bold"
                >
                  {t('common.tryAgain', { defaultValue: 'Try again' })}
                </button>
              </>
            )}
            {state === 'error' && (
              <>
                <p className="text-xs font-semibold">
                  {t('qr.openCameraFailedTitle', { defaultValue: 'Failed to open camera' })}
                </p>
                {errorText && (
                  <p className="text-[11px] text-white/70 leading-snug break-words">{errorText}</p>
                )}
                <button
                  onClick={() => {
                    startedRef.current = false
                    void start()
                  }}
                  className="min-h-11 px-5 py-2 rounded-pill bg-white text-black text-xs font-bold"
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
    /token=([^&?\s]+)/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1]
  }
  if (/^[a-zA-Z0-9_-]{8,}$/.test(text.trim())) return text.trim()
  return null
}

