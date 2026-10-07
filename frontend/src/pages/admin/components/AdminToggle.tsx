import type { ReactNode } from 'react'

type AdminToggleProps = {
  checked: boolean
  onChange: (value: boolean) => void
  label: ReactNode
  disabled?: boolean
}

/**
 * Accessible switch used across the admin panel.
 *
 * A native `<input type="checkbox">` is tiny and hard to hit inside a Telegram
 * WebView, so the whole row is a big tap target (`role="switch"`) and the visual
 * state is drawn explicitly. Callers that persist over the network should update
 * their state optimistically, otherwise the knob snaps back until the API responds.
 */
export function AdminToggle({ checked, onChange, label, disabled = false }: AdminToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">{label}</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked ? 'bg-black' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}
