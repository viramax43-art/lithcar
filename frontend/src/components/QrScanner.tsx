import { useEffect, useMemo, useRef, useState } from 'react'

interface QrScannerProps {
  onTokenRead: (token: string) => void
}

const SCANNER_REGION_ID = 'points-qr-scanner-region'

export default function QrScanner({ onTokenRead }: QrScannerProps) {
  const [isStarting, setIsStarting] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)

  const uniqueRegionId = useMemo(
    () => `${SCANNER_REGION_ID}-${Math.random().toString(36).slice(2, 10)}`,
    []
  )

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => undefined)
        scannerRef.current.clear()
      }
    }
  }, [])

  const start = async () => {
    if (isRunning || isStarting) return
    setIsStarting(true)
    try {
      const html5QrcodeModule = await import('html5-qrcode')
      const scanner = new html5QrcodeModule.Html5Qrcode(uniqueRegionId, { verbose: false })
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText: string) => {
          const token = extractToken(decodedText)
          if (!token) return
          onTokenRead(token)
          await scanner.stop().catch(() => undefined)
          scanner.clear()
          scannerRef.current = null
          setIsRunning(false)
        },
        () => undefined
      )
      setIsRunning(true)
    } finally {
      setIsStarting(false)
    }
  }

  const stop = async () => {
    if (!scannerRef.current) return
    await scannerRef.current.stop().catch(() => undefined)
    scannerRef.current.clear()
    scannerRef.current = null
    setIsRunning(false)
  }

  return (
    <div className="space-y-3">
      <div id={uniqueRegionId} className="min-h-36 rounded-xl border border-border overflow-hidden bg-surface" />
      <div className="flex gap-2">
        {!isRunning ? (
          <button
            onClick={() => void start()}
            disabled={isStarting}
            className="px-3 py-2 rounded-xl bg-black text-white text-xs font-semibold disabled:opacity-50"
          >
            {isStarting ? 'Запуск камеры...' : 'Сканировать QR'}
          </button>
        ) : (
          <button
            onClick={() => void stop()}
            className="px-3 py-2 rounded-xl bg-surface text-xs font-semibold"
          >
            Остановить камеру
          </button>
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
