import { useState, useEffect } from 'react'
import Sidebar, { navItems } from './components/Sidebar.jsx'
import Home from './pages/Home.jsx'
import Pages from './pages/Pages.jsx'
import Profile from './pages/Profile.jsx'
import Login from './pages/Login.jsx'
import { supabase } from './utils/supabaseClient'
import { useToast } from './utils/toast.jsx'
import NbscLogo from './assets/Nbsc-logo.png'
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
  const [authError, setAuthError] = useState('')
  const toast = useToast()
  // Track previous session to detect transitions
  const [prevSession, setPrevSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email?.endsWith('@nbsc.edu.ph')) {
        setSession(session)
      } else if (session) {
        supabase.auth.signOut()
        setAuthError('Only @nbsc.edu.ph email addresses are allowed.')
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('[Auth] State change:', _event, session?.user?.email ?? 'no session')
      
      if (_event === 'SIGNED_OUT') {
        setSession(null)
        setAuthError('')
        setLoading(false)
        return
      }

      if (_event === 'SIGNED_IN' && session?.user?.email) {
        console.log('[Auth] User signed in:', session.user.email)
        
        if (!session.user.email.endsWith('@nbsc.edu.ph')) {
          console.log('[Auth] Email not institutional, signing out')
          supabase.auth.signOut()
          setSession(null)
          setAuthError('Only @nbsc.edu.ph email addresses are allowed.')
          toast.error('Access denied. Only @nbsc.edu.ph accounts are allowed.')
        } else {
          console.log('[Auth] Email is institutional, syncing profile...')
          // Sync profile metadata from auth (for both Google and email sign-in)
          // Since email is confirmed to be institutional, we can trust the metadata
          console.log('[App] Auth metadata:', session.user.user_metadata)
          const authName = session.user.user_metadata?.full_name ||
                          session.user.user_metadata?.name ||
                          `${session.user.user_metadata?.given_name || ''} ${session.user.user_metadata?.family_name || ''}`.trim() ||
                          session.user.user_metadata?.given_name ||
                          session.user.email?.split('@')[0]

          const authAvatar = session.user.user_metadata?.avatar_url ||
                           session.user.user_metadata?.picture

          console.log('[App] Extracted name:', authName, 'avatar:', authAvatar)

          try {
            // Check if profile exists
            const { data: existingProfile, error: profileError } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_url')
              .eq('id', session.user.id)
              .maybeSingle()

            console.log('[App] Existing profile:', existingProfile, 'Error:', profileError)

            if (existingProfile) {
              // Update existing profile with metadata
              const { error: updateError } = await supabase
                .from('profiles')
                .update({
                  full_name: authName,
                  avatar_url: authAvatar
                })
                .eq('id', session.user.id)

              console.log('[App] Profile update error:', updateError)
            } else {
              // Create profile (in case trigger didn't fire for existing users)
              const { error: createError } = await supabase
                .from('profiles')
                .insert({
                  id: session.user.id,
                  email: session.user.email,
                  full_name: authName,
                  avatar_url: authAvatar,
                  role: 'student',
                  student_id: session.user.email.split('@')[0]
                })

              console.log('[App] Profile create error:', createError)
            }
          } catch (err) {
            console.error('[App] Profile sync error:', err)
            // Don't block sign-in if profile sync fails
          }

          console.log('[App] Setting session')
          setSession(session)
          setAuthError('')
          // Check if user has both Google and password identities
          const hasGoogle = session.user.identities?.some(i => i.provider === 'google')
          const hasPassword = session.user.identities?.some(i => i.provider === 'email')
          
          if (hasGoogle && hasPassword) {
            console.log('[App] User has both Google and password sign-in methods linked')
          } else if (hasGoogle && !hasPassword) {
            console.log('[App] User has Google only - can add password in Profile')
          } else if (!hasGoogle && hasPassword) {
            console.log('[App] User has password only - can link Google in Profile')
          }
        }
        setLoading(false)
        return
      }

      if (session?.user?.email) {
        if (!session.user.email.endsWith('@nbsc.edu.ph')) {
          supabase.auth.signOut()
          setSession(null)
          setAuthError('Only @nbsc.edu.ph email addresses are allowed.')
        } else {
          setSession(session)
          setAuthError('')
        }
      } else {
        setSession(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line

  const handleNavigate = (id) => {
    setActivePage(id)
    setSidebarOpen(false)
  }

  const handleLogout = async () => {
    // Clear user's message state (edited_at, reply_to, is_deleted) from database
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('gc_messages')
          .update({ edited_at: null, reply_to: null, is_deleted: false })
          .eq('sender_id', user.id)
      }
    } catch (error) {
      console.error('Failed to clear message state:', error)
    }

    await supabase.auth.signOut()
    toast.info('You have been signed out.')
  }

  const currentLabel = navItems.find((item) => item.id === activePage)?.label ?? ''

  if (loading) {
    return (
      <div className="home">
        <div className="home__card home__card--center">
          <p>Loading...</p>
          {authError && <p style={{color: 'red', marginTop: '10px'}}>{authError}</p>}
        </div>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return <Home key="home" session={session} />
      case 'pages':
        return <Pages key="pages" />
      case 'profile':
        return <Profile key="profile" session={session} />
      default:
        return <Home key="home" session={session} />
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
        session={session}
      />

      <div className="main-content">
        <header className="topbar">
          <button
            type="button"
            className="topbar__burger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon width={20} height={20} />
          </button>

          <div className="topbar__brand">
            <img src={NbscLogo} alt="NBSC" className="topbar__logo-img" />
            <span className="topbar__brand-text">NBSC Student Portal</span>
          </div>

          <h1 className="topbar__title">{currentLabel}</h1>

          <div className="topbar__profile">
            <div className="topbar__avatar">
              {session?.user?.user_metadata?.avatar_url
                ? <img src={session.user.user_metadata.avatar_url} alt="avatar" />
                : <span>{(session?.user?.email?.[0] ?? '?').toUpperCase()}</span>
              }
            </div>
            <div className="topbar__user-info">
              <span className="topbar__user-name">
                {session?.user?.user_metadata?.full_name
                  || session?.user?.user_metadata?.name
                  || session?.user?.email?.split('@')[0]}
              </span>
              <span className="topbar__user-email">{session?.user?.email}</span>
            </div>
          </div>
        </header>

        <main className="content-area">
          {renderPage()}
        </main>
      </div>
    </div>
  )
}

export default App