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
      style={{ minHeight: 64, paddingBottom: 'var(--app-safe-area-bottom-total)' }}>
      {tabs.map((tab) => {
        const active = location.pathname === tab.path
        return (
          <button
            key={tab.path}
            onClick={() => {
              hapticSelection()
              navigate(tab.path)
            }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 px-2 transition-colors duration-200 ${
              active ? 'text-accent-dark' : 'text-muted'
            }`}
          >
            <span className={`transition-transform duration-200 ${active ? 'scale-110' : 'scale-100'}`}>
              <tab.icon size={22} weight={active ? 'fill' : 'regular'} />
            </span>
            <span className={`text-[10px] font-medium transition-all duration-200 ${active ? 'opacity-100' : 'opacity-60'}`}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
