/**
 * Бэкенд отклоняет поездку, до которой меньше лид-тайма:
 * `Ride must be scheduled at least N hours in advance.`
 *
 * Список слотов строится на клиенте, поэтому на самой границе лид-тайма выбранное
 * время может «устареть», пока пользователь заполняет форму. В этом случае
 * показываем понятную подсказку вместо сырого текста API.
 */
export function isRideLeadTimeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return /must be scheduled at least/i.test(message)
}
