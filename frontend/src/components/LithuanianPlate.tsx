/**
 * Lithuanian (EU-style) car license plate renderer.
 * Format: blue EU strip on the left (12 stars + "LT") + white plate body with bold black text.
 */
import { Star } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

interface LithuanianPlateProps {
  value: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES: Record<NonNullable<LithuanianPlateProps['size']>, {
  height: string
  padX: string
  fontSize: string
  stripWidth: string
  stripStarsSize: string
  stripLtSize: string
}> = {
  sm: {
    height: 'h-7',
    padX: 'px-2.5',
    fontSize: 'text-sm',
    stripWidth: 'w-5',
    stripStarsSize: 'text-[7px]',
    stripLtSize: 'text-[8px]',
  },
  md: {
    height: 'h-9',
    padX: 'px-3',
    fontSize: 'text-lg',
    stripWidth: 'w-6',
    stripStarsSize: 'text-[8px]',
    stripLtSize: 'text-[10px]',
  },
  lg: {
    height: 'h-12',
    padX: 'px-4',
    fontSize: 'text-2xl',
    stripWidth: 'w-8',
    stripStarsSize: 'text-[10px]',
    stripLtSize: 'text-[13px]',
  },
}

function formatPlate(raw: string): string {
  const cleaned = raw.replace(/[\s-]/g, '').toUpperCase()
  if (cleaned.length === 6) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`
  }
  return cleaned || raw
}

export default function LithuanianPlate({ value, size = 'md', className = '' }: LithuanianPlateProps) {
  const { t } = useTranslation()
  const s = SIZES[size]
  const formatted = formatPlate(value)
  return (
    <div
      className={`inline-flex items-stretch rounded-md overflow-hidden bg-white border-[1.5px] border-zinc-900 shadow-sm ${s.height} ${className}`}
      aria-label={t('vehicle.plateAria', {
        value: formatted,
        defaultValue: `Lithuanian plate ${formatted}`,
      })}
    >
      {/* EU blue strip with circle of stars + LT */}
      <div
        className={`flex flex-col items-center justify-center text-white ${s.stripWidth}`}
        style={{ background: '#003399' }}
      >
        <Star size={size === 'sm' ? 7 : size === 'md' ? 8 : 10} weight="fill" style={{ color: '#FFCC00' }} />
        <span
          className={`leading-none font-extrabold tracking-tight ${s.stripLtSize}`}
          style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          LT
        </span>
      </div>
      {/* Plate text */}
      <div
        className={`flex items-center font-extrabold tracking-[0.12em] text-zinc-900 ${s.padX} ${s.fontSize}`}
        style={{ fontFamily: '"Bahnschrift", "DIN Alternate", "Helvetica Neue", system-ui, sans-serif' }}
      >
        {formatted}
      </div>
    </div>
  )
}
