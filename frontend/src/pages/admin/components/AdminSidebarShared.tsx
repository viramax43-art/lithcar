import { Copy } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

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

/** Russian/LT color name aliases for legacy vehicle color strings (not UI labels). */
const COLOR_NAME_TO_HEX: Record<string, string> = {
  '\u0447\u0451\u0440\u043d\u044b\u0439': '#000000',
  '\u0447\u0435\u0440\u043d\u044b\u0439': '#000000',
  '\u0431\u0435\u043b\u044b\u0439': '#ffffff',
  '\u0441\u0435\u0440\u044b\u0439': '#9ca3af',
  '\u0441\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442\u044b\u0439': '#c0c0c0',
  '\u0441\u0435\u0440\u0435\u0431\u0440\u044f\u043d\u044b\u0439': '#c0c0c0',
  '\u043a\u0440\u0430\u0441\u043d\u044b\u0439': '#ef4444',
  '\u0441\u0438\u043d\u0438\u0439': '#3b82f6',
  '\u0433\u043e\u043b\u0443\u0431\u043e\u0439': '#60a5fa',
  '\u0437\u0435\u043b\u0451\u043d\u044b\u0439': '#22c55e',
  '\u0437\u0435\u043b\u0435\u043d\u044b\u0439': '#22c55e',
  '\u0436\u0451\u043b\u0442\u044b\u0439': '#eab308',
  '\u0436\u0435\u043b\u0442\u044b\u0439': '#eab308',
  '\u043e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0439': '#f97316',
  '\u043a\u043e\u0440\u0438\u0447\u043d\u0435\u0432\u044b\u0439': '#92400e',
  '\u0444\u0438\u043e\u043b\u0435\u0442\u043e\u0432\u044b\u0439': '#a855f7',
  '\u0440\u043e\u0437\u043e\u0432\u044b\u0439': '#ec4899',
  '\u0431\u043e\u0440\u0434\u043e\u0432\u044b\u0439': '#7f1d1d',
  '\u0431\u0435\u0436\u0435\u0432\u044b\u0439': '#d6b88e',
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
  const { t } = useTranslation()
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
      <p className="text-[11px] text-amber-800 font-semibold">{title}</p>
      <p className="text-xs font-mono break-all bg-white/60 rounded-lg px-2 py-1.5">{value}</p>
      <button
        onClick={onCopy}
        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-pill bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors"
      >
        <Copy size={12} />
        {t('common.copy')}
      </button>
      {copied && <p className="text-[10px] text-emerald-700">{t('common.keyCopied')}</p>}
      {copyError && <p className="text-[10px] text-red-600">{t('common.copyFailed')}</p>}
    </div>
  )
}
