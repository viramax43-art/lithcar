import { Copy } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

export type CopyState = 'idle' | 'ok' | 'error'

export const inputCls =
  'w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-surface text-sm outline-none focus:border-black focus:bg-white transition-colors'

export function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-3">
      <div className="mb-1">{icon}</div>
      <p className="text-base font-extrabold leading-none">{value}</p>
      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mt-1">{label}</p>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{title}</p>
      {children}
    </div>
  )
}

const COLOR_NAME_TO_HEX: Record<string, string> = {
  чёрный: '#000000',
  черный: '#000000',
  белый: '#ffffff',
  серый: '#9ca3af',
  серебристый: '#c0c0c0',
  серебряный: '#c0c0c0',
  красный: '#ef4444',
  синий: '#3b82f6',
  голубой: '#60a5fa',
  зелёный: '#22c55e',
  зеленый: '#22c55e',
  жёлтый: '#eab308',
  желтый: '#eab308',
  оранжевый: '#f97316',
  коричневый: '#92400e',
  фиолетовый: '#a855f7',
  розовый: '#ec4899',
  бордовый: '#7f1d1d',
  бежевый: '#d6b88e',
  golden: '#daa520',
  gold: '#daa520',
}

export function ColorSwatch({ color }: { color: string }) {
  const key = color.trim().toLowerCase()
  const normalized = color.trim()
  const isHex = /^#?[0-9a-f]{3,8}$/i.test(normalized)
  const value = isHex
    ? normalized.startsWith('#')
      ? normalized
      : `#${normalized}`
    : COLOR_NAME_TO_HEX[key] ?? '#9ca3af'

  return (
    <span
      className="w-3.5 h-3.5 rounded-full border border-border flex-shrink-0"
      style={{ background: value }}
    />
  )
}

export function KeyReveal({
  title,
  value,
  onCopy,
  copied,
  copyError,
}: {
  title: string
  value: string
  onCopy: () => void
  copied: boolean
  copyError: boolean
}) {
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
      <p className="text-[11px] text-amber-800 font-semibold">{title}</p>
      <p className="text-xs font-mono break-all bg-white/60 rounded-lg px-2 py-1.5">{value}</p>
      <button
        onClick={onCopy}
        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-pill bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors"
      >
        <Copy size={12} />
        Скопировать
      </button>
      {copied && <p className="text-[10px] text-emerald-700">Ключ скопирован.</p>}
      {copyError && <p className="text-[10px] text-red-600">Не удалось скопировать.</p>}
    </div>
  )
}
