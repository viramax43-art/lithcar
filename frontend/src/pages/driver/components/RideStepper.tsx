import { Check } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { RideStatus } from '../../../types'
import { DRIVER_FLOW_STEPS } from '../constants'

export default function RideStepper({ status }: { status: RideStatus }) {
  const { t } = useTranslation()
  const currentIndex = DRIVER_FLOW_STEPS.findIndex((s) => s.key === status)

  return (
    <div className="flex items-center gap-1">
      {DRIVER_FLOW_STEPS.map((step, idx) => {
        const done = idx < currentIndex
        const active = idx === currentIndex
        return (
          <div key={step.key} className="flex items-center gap-1 flex-1 min-w-0">
            <div className="flex flex-col items-center min-w-0 flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors flex-shrink-0 ${
                  done
                    ? 'bg-accent text-black'
                    : active
                      ? 'bg-white text-black ring-2 ring-accent ring-offset-2 ring-offset-black'
                      : 'bg-white/10 text-white/50'
                }`}
              >
                {done ? <Check size={13} weight="bold" /> : idx + 1}
              </div>
              <span
                className={`text-[10px] font-bold mt-1 text-center leading-tight max-w-full px-0.5 break-words ${
                  active ? 'text-white' : done ? 'text-white/85' : 'text-white/65'
                }`}
              >
                {t(step.shortKey, { defaultValue: step.shortKey })}
              </span>
            </div>
            {idx < DRIVER_FLOW_STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 -mt-4 transition-colors ${
                  done ? 'bg-accent' : 'bg-white/15'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
