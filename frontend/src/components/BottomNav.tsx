import { useLocation, useNavigate } from 'react-router-dom'
import { MapPin, ClipboardText, UserCircle } from '@phosphor-icons/react'
import { hapticSelection } from '../lib/telegram'

const tabs = [
  { path: '/', icon: MapPin, label: 'Новая заявка' },
  { path: '/requests', icon: ClipboardText, label: 'Мои поездки' },
  { path: '/profile', icon: UserCircle, label: 'Профиль' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-border flex items-center justify-around z-50"
      style={{ minHeight: 64, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {tabs.map((tab) => {
        const active = location.pathname === tab.path
        return (
          <button
            key={tab.path}
            onClick={() => {
              hapticSelection()
              navigate(tab.path)
            }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 px-2 transition-colors duration-150 ${
              active ? 'text-accent-dark' : 'text-muted'
            }`}
          >
            <tab.icon size={22} weight={active ? 'fill' : 'regular'} />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
