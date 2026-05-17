import type { CSSProperties } from 'react'

interface SkeletonProps {
  className?: string
  width?: number | string
  height?: number | string
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'pill' | 'full'
  style?: CSSProperties
}

const ROUNDED_MAP: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  xl: 'rounded-2xl',
  '2xl': 'rounded-3xl',
  pill: 'rounded-pill',
  full: 'rounded-full',
}

export default function Skeleton({
  className = '',
  width,
  height,
  rounded = 'md',
  style,
}: SkeletonProps) {
  const sizeStyle: CSSProperties = {}
  if (width !== undefined) sizeStyle.width = typeof width === 'number' ? `${width}px` : width
  if (height !== undefined) sizeStyle.height = typeof height === 'number' ? `${height}px` : height
  return (
    <span
      aria-hidden="true"
      className={`inline-block bg-surface animate-pulse ${ROUNDED_MAP[rounded]} ${className}`}
      style={{ ...sizeStyle, ...style }}
    />
  )
}
