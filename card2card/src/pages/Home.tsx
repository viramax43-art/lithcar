import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, DownloadSimple, QrCode, ShieldCheck, X } from '@phosphor-icons/react'
import { generateBrandedQr, downloadQrImage } from '../lib/brandedQr'
import { digitsOnly, formatCardNumber, isValidCardNumber, maskCardNumber } from '../lib/cardNumber'

type QrPreview = {
  label: string
  cardNumber: string
  maskedNumber: string
  dataUrl: string
}

export default function Home() {
  const [label, setLabel] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [qrPreview, setQrPreview] = useState<QrPreview | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCardInput = (value: string) => {
    setCardNumber(formatCardNumber(value))
    setError(null)
  }

  const handleGenerate = useCallback(async () => {
    if (!isValidCardNumber(cardNumber)) {
      setError('Введите номер карты — от 13 до 19 цифр.')
      return
    }

    const trimmedLabel = label.trim() || 'Моя карта'
    const digits = cardNumber.replace(/\s/g, '')

    setIsGenerating(true)
    setError(null)

    try {
      const dataUrl = await generateBrandedQr(digits, trimmedLabel)
      setQrPreview({
        label: trimmedLabel,
        cardNumber: digits,
        maskedNumber: maskCardNumber(digits),
        dataUrl,
      })
      setLabel('')
      setCardNumber('')
    } catch {
      setError('Не удалось создать QR. Попробуйте ещё раз.')
    } finally {
      setIsGenerating(false)
    }
  }, [cardNumber, label])

  const handleDownload = () => {
    if (!qrPreview) return
    const safeLabel = qrPreview.label.replace(/[^\wа-яА-ЯёЁ-]+/gi, '-').toLowerCase()
    downloadQrImage(qrPreview.dataUrl, `card2card-${safeLabel || 'card'}.png`)
  }

  const canGenerate = isValidCardNumber(cardNumber) && !isGenerating
  const previewDigits = digitsOnly(cardNumber)

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col overflow-x-hidden animate-slide-in-right">
      <header
        className="flex-shrink-0 bg-white border-b border-border/50"
        style={{ paddingTop: 'var(--app-user-safe-top)' }}
      >
        <div className="flex items-center gap-3 px-3 h-14 w-full max-w-2xl mx-auto">
          <span className="w-9 h-9 rounded-xl bg-black text-accent flex items-center justify-center flex-shrink-0">
            <QrCode size={20} weight="bold" />
          </span>
          <h1 className="text-base font-extrabold tracking-tight flex-1">card2card</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'var(--app-user-safe-bottom)' }}>
        <div className="p-4 space-y-4 w-full max-w-2xl mx-auto">
          <CardVisual label={label} digits={previewDigits} />

          <section className="bg-white border border-border rounded-card p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-muted">Название на QR</label>
              <input
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Kapital · Основная"
                className="w-full h-12 px-4 rounded-2xl border-[1.5px] border-border bg-surface text-base font-bold outline-none focus:border-black focus:bg-white transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-muted">Номер карты</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={cardNumber}
                onChange={(event) => handleCardInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleGenerate()
                }}
                placeholder="4169 7380 1234 5678"
                className="w-full h-12 px-4 rounded-2xl border-[1.5px] border-border bg-surface text-base font-bold tracking-wide outline-none focus:border-black focus:bg-white transition-colors font-mono"
              />
            </div>

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}

            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              className={`w-full h-12 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                canGenerate ? 'bg-black text-white active:scale-[0.98]' : 'bg-surface text-muted'
              }`}
            >
              {isGenerating ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Создаём QR…
                </>
              ) : (
                <>
                  <QrCode size={18} weight="bold" />
                  Получить QR
                </>
              )}
            </button>
          </section>

          <section className="rounded-2xl bg-surface px-4 py-3 flex items-start gap-3">
            <ShieldCheck size={20} weight="duotone" className="text-accent-dark flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted leading-relaxed">
              Мы не храним номера карт. QR генерируется на лету — сохраните изображение у себя в галерее.
            </p>
          </section>
        </div>
      </div>

      {qrPreview && (
        <QrPreviewSheet preview={qrPreview} onClose={() => setQrPreview(null)} onDownload={handleDownload} />
      )}
    </div>
  )
}

function CardVisual({ label, digits }: { label: string; digits: string }) {
  const groups = [0, 1, 2, 3].map((index) => {
    const chunk = digits.slice(index * 4, index * 4 + 4)
    return chunk.padEnd(4, '•')
  })

  return (
    <section className="relative overflow-hidden bg-black text-white rounded-card p-5 h-44 flex flex-col justify-between">
      <div className="absolute -right-10 -top-12 w-44 h-44 rounded-full bg-accent/15 blur-2xl" />
      <div className="absolute -left-8 -bottom-12 w-40 h-40 rounded-full bg-accent/10 blur-2xl" />

      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold">card2card</p>
          <p className="text-sm font-bold truncate mt-1">{label.trim() || 'Моя карта'}</p>
        </div>
        <span className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
          <QrCode size={18} weight="bold" className="text-accent" />
        </span>
      </div>

      <div className="relative flex items-center gap-3 font-mono text-lg font-bold tracking-wider">
        {groups.map((group, index) => (
          <span key={index} className="text-white/90">
            {group}
          </span>
        ))}
      </div>
    </section>
  )
}

function QrPreviewSheet({
  preview,
  onClose,
  onDownload,
}: {
  preview: QrPreview
  onClose: () => void
  onDownload: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      if (copyResetRef.current) clearTimeout(copyResetRef.current)
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview.cardNumber)
      setCopied(true)
      if (copyResetRef.current) clearTimeout(copyResetRef.current)
      copyResetRef.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable — silent
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-card shadow-card flex flex-col max-h-[92dvh] animate-slide-up"
        style={{ paddingBottom: 'var(--app-user-safe-bottom)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold tracking-tight">Ваш QR готов</p>
            <p className="text-[11px] text-muted truncate">{preview.label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-pill bg-surface flex items-center justify-center active:scale-[0.95] transition-transform touch-none"
            aria-label="Закрыть"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-2 overflow-y-auto space-y-4">
          <div className="rounded-2xl bg-surface p-4 flex items-center justify-center">
            <img
              src={preview.dataUrl}
              alt={`QR card2card — ${preview.label}`}
              className="w-full max-w-[280px] aspect-[280/372] object-contain"
            />
          </div>

          <button
            type="button"
            onClick={() => void handleCopy()}
            className="w-full rounded-2xl bg-surface px-4 py-3 flex items-center justify-between gap-3 active:scale-[0.98] transition-transform"
          >
            <span className="text-sm font-bold font-mono tracking-wide truncate">{preview.maskedNumber}</span>
            <span
              className={`flex items-center gap-1 text-[11px] font-bold flex-shrink-0 ${
                copied ? 'text-accent-dark' : 'text-muted'
              }`}
            >
              {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
              {copied ? 'Скопировано' : 'Копировать'}
            </span>
          </button>

          <p className="text-center text-[11px] text-muted leading-relaxed px-2">
            Сохраните QR в галерею. При сканировании откроется номер карты для копирования.
          </p>

          <button
            type="button"
            onClick={onDownload}
            className="w-full h-12 rounded-2xl bg-black text-white text-sm font-bold active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <DownloadSimple size={18} weight="bold" />
            Сохранить в галерею
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-2xl bg-surface text-sm font-semibold"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  )
}
