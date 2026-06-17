import type { TFunction } from 'i18next'
import { showMatchUi } from '../components/MatchScoreChip'

export function getPassengerMatchButtonLabel(
  score: number,
  t: TFunction,
): string | null {
  if (!showMatchUi(score)) return null
  if (score >= 80) {
    return t('passenger.offers.matchButton.excellent', {
      score,
      defaultValue: `Excellent match ${score}%`,
    })
  }
  return t('passenger.offers.matchButton.possible', {
    score,
    defaultValue: `Possible match ${score}%`,
  })
}

export function getDriverMatchClaimLabel(score: number, t: TFunction): string | null {
  if (!showMatchUi(score)) return null
  return t('driver.offers.matchButton.claim', {
    score,
    defaultValue: `Match ${score}% — Claim`,
  })
}
