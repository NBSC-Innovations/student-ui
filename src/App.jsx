import { useState, useEffect } from 'react'
import Sidebar, { navItems } from './components/Sidebar.jsx'
import Home from './pages/Home.jsx'
import Pages from './pages/Pages.jsx'
import Login from './pages/Login.jsx'
import { supabase } from './utils/supabaseClient'
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
  const [activePage, setActivePage] = useState('home')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleNavigate = (id) => {
    setActivePage(id)
    setSidebarOpen(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  const currentLabel = navItems.find((item) => item.id === activePage)?.label ?? ''

  if (loading) {
    return <div className="home"><div className="home__card home__card--center"><p>Loading...</p></div></div>
  }

  if (!session) {
    return <Login />
  }

  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return <Home />
      case 'pages':
        return <Pages />
      // case 'profile':
      //   return <Profile />
      default:
        return <Home />
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