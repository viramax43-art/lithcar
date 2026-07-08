import QRCode from 'qrcode'
import { maskCardNumber } from './cardNumber'

const BRAND = 'card2card'
const ACCENT = '#22EA36'
const MUTED = '#858585'

export async function generateBrandedQr(cardNumber: string, label: string): Promise<string> {
  const payload = cardNumber.replace(/\s/g, '')
  const qrSize = 280
  const padding = 28
  const headerHeight = 56
  const footerHeight = 52
  const width = qrSize + padding * 2
  const height = qrSize + padding * 2 + headerHeight + footerHeight

  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, payload, {
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#ffffff' },
  })

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#000000'
  ctx.font = '800 20px Inter, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(BRAND, width / 2, 24)

  ctx.fillStyle = ACCENT
  ctx.fillRect(padding, headerHeight - 10, width - padding * 2, 4)

  ctx.drawImage(qrCanvas, padding, headerHeight)

  const centerSize = 52
  const centerX = width / 2 - centerSize / 2
  const centerY = headerHeight + qrSize / 2 - centerSize / 2
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(centerX - 4, centerY - 4, centerSize + 8, centerSize + 8)
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.roundRect(centerX, centerY, centerSize, centerSize, 12)
  ctx.fill()
  ctx.fillStyle = ACCENT
  ctx.font = '800 11px Inter, -apple-system, sans-serif'
  ctx.fillText('c2c', width / 2, headerHeight + qrSize / 2 + 1)

  ctx.fillStyle = MUTED
  ctx.font = '600 12px Inter, -apple-system, sans-serif'
  ctx.fillText(label.trim() || 'Моя карта', width / 2, height - 30)

  ctx.fillStyle = '#000000'
  ctx.font = '700 14px Inter, -apple-system, sans-serif'
  ctx.fillText(maskCardNumber(payload), width / 2, height - 12)

  return canvas.toDataURL('image/png')
}

export function downloadQrImage(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
}
