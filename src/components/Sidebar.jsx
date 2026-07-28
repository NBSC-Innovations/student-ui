import '../styles/Sidebar.css'
import NbscLogo from '../assets/Nbsc-logo.png'

function HomeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
    </svg>
  )
}

function PagesIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="4" x2="8" y2="9" />
    </svg>
  )
}

function ProfileIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.418 3.582-7 8-7s8 2.582 8 7" />
    </svg>
  )
}

function LogoutIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const navItems = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'pages', label: 'Pages', icon: PagesIcon },
  { id: 'profile', label: 'Profile', icon: ProfileIcon },
]

function Sidebar({ activePage, onNavigate, isOpen, onClose, onLogout }) {
  return (
    <>
      <div
        className={`sidebar-backdrop ${isOpen ? 'sidebar-backdrop--visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
        {/* Brand */}
        <div className="sidebar__brand">
          <img src={NbscLogo} alt="NBSC Logo" className="sidebar__logo-img" />
          <div className="sidebar__brand-text">
            <span className="sidebar__brand-title">Student Portal</span>
            <span className="sidebar__brand-sub">Northern Bukidnon State College</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar__nav" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`sidebar__nav-item ${activePage === id ? 'sidebar__nav-item--active' : ''}`}
              onClick={() => onNavigate(id)}
              aria-current={activePage === id ? 'page' : undefined}
            >
              <Icon className="sidebar__nav-icon" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Profile + logout footer */}
        <div className="sidebar__footer">
          <button type="button" className="sidebar__logout" onClick={onLogout}>
            <LogoutIcon className="sidebar__nav-icon" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}

export default Sidebar