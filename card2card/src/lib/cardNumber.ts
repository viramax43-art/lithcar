export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function formatCardNumber(value: string): string {
  const digits = digitsOnly(value).slice(0, 16)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

export function maskCardNumber(value: string): string {
  const digits = digitsOnly(value)
  if (digits.length < 4) return digits
  const last4 = digits.slice(-4)
  return `•••• •••• •••• ${last4}`
}

export function isValidCardNumber(value: string): boolean {
  const digits = digitsOnly(value)
  return digits.length >= 13 && digits.length <= 19
}
