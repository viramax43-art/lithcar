import { useTranslation } from 'react-i18next'

interface MatchScoreChipProps {
  score: number
  namespace?: 'passenger' | 'driver'
}

export default function MatchScoreChip({ score, namespace = 'passenger' }: MatchScoreChipProps) {
  const { t } = useTranslation()
  const key = namespace === 'driver' ? 'driver.offers.matchBadge' : 'passenger.offers.matchBadge'
  return (
    <span className="inline-flex text-xs font-bold px-3 py-1 rounded-pill bg-accent/15 text-accent-dark">
      {t(key, { score, defaultValue: `Match ${score}%` })}
    </span>
  )
}

export function showMatchUi(matchScore: number): boolean {
  return matchScore >= 60
}
