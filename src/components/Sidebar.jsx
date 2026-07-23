import '../styles/Sidebar.css'

function DashboardIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

function FindGcIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function GroupChatsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
  { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
  { id: 'find-gc', label: 'Find Group Chat', icon: FindGcIcon },
  { id: 'group-chats', label: 'Group Chats', icon: GroupChatsIcon },
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
        <div className="sidebar__brand">
          <div className="sidebar__logo">NBSC</div>
          <div className="sidebar__brand-text">
            <span className="sidebar__brand-title">Student Portal</span>
            <span className="sidebar__brand-sub">Northern Bukidnon State College</span>
          </div>
        </div>

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