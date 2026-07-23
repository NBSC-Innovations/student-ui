import { useState } from 'react'
import Sidebar, { navItems } from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import './App.css'

function MenuIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleNavigate = (id) => {
    setActivePage(id)
    setSidebarOpen(false)
  }

  const handleLogout = () => {
    // TODO: wire up actual logout logic
    console.log('Logout clicked')
  }

  const currentLabel = navItems.find((item) => item.id === activePage)?.label ?? ''

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard />
      // case 'find-gc':
      //   return <FindGc />
      // case 'group-chats':
      //   return <GroupChats />
      // case 'profile':
      //   return <Profile />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="app-layout">
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={handleLogout}
      />

      <div className="main-content">
        <header className="topbar">
          <div className="topbar__brand">
            <div className="topbar__logo">NBSC</div>
            <span className="topbar__brand-text">NBSC SIS</span>
          </div>

          <h1 className="topbar__title">{currentLabel}</h1>

          <button
            type="button"
            className="topbar__burger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon width={20} height={20} />
          </button>
        </header>

        <main className="content-area">
          {renderPage()}
        </main>
      </div>
    </div>
  )
}

export default App