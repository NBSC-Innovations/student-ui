import { useState, useEffect, useRef } from 'react'
import '../styles/Home.css'
import { supabase } from '../utils/supabaseClient'
import { useToast } from '../utils/toast.jsx'
import { saveStudentSubjects, getStudentEnrollments, getMessages, sendMessage, editMessage, unsendMessage, markMessageSeen, getSeenReceipts, subscribeToMessages, subscribeToSeen, getCourseMembers, subscribeToMembers } from '../utils/databaseService'

function UploadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function ChatIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function BackIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function SendIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

// ── Thread view with real-time messaging ─────────────────────────────────
function ThreadView({ subject, onBack }) {
  const [messages, setMessages]         = useState([])
  const [text, setText]                 = useState('')
  const [sending, setSending]           = useState(false)
  const [currentUser, setCurrentUser]   = useState(null)
  const [showNetiquette, setShowNetiquette] = useState(false)
  const [replyTo, setReplyTo]           = useState(null)   // { id, content, senderName }
  const [editingId, setEditingId]       = useState(null)
  const [editText, setEditText]         = useState('')
  const [menuMsgId, setMenuMsgId]       = useState(null)
  const [menuPos, setMenuPos]           = useState({ x: 0, y: 0 })
  const [seenMap, setSeenMap]           = useState({})
  const [members, setMembers]           = useState([])   // enrolled students
  const [viewingMember, setViewingMember] = useState(null)  // member profile being viewed
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)

  // ── Load user, messages, seen receipts, members ─────────────────────────
  useEffect(() => {
    let uid
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user)
      uid = user?.id
    })

    getMessages(subject.courseId).then(({ success, messages: msgs }) => {
      if (success) setMessages(msgs)
    })

    getSeenReceipts(subject.courseId).then(({ receipts }) => {
      if (receipts) buildSeenMap(receipts)
    })

    // Load members
    getCourseMembers(subject.courseId).then(({ members: m }) => setMembers(m))

    // Real-time: new & updated messages
    const msgChannel = subscribeToMessages(
      subject.courseId,
      (newMsg) => setMessages(prev => [...prev, newMsg]),
      (updated) => setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
    )

    // Real-time: seen receipts
    const seenChannel = subscribeToSeen(subject.courseId, (receipt) => {
      setSeenMap(prev => {
        const existing = prev[receipt.message_id] || []
        if (existing.find(r => r.user_id === receipt.user_id)) return prev
        return { ...prev, [receipt.message_id]: [...existing, receipt] }
      })
    })

    // Real-time: enrollment changes (someone joins/leaves)
    const memberChannel = subscribeToMembers(subject.courseId, () => {
      getCourseMembers(subject.courseId).then(({ members: m }) => setMembers(m))
    })

    return () => {
      msgChannel.unsubscribe()
      seenChannel.unsubscribe()
      memberChannel.unsubscribe()
    }
  }, [subject.courseId])

  // ── Mark messages as seen when they appear ──────────────────────────────
  useEffect(() => {
    if (!currentUser || !messages.length) return
    const unseen = messages.filter(
      m => m.sender_id !== currentUser.id &&
           !m.is_deleted &&
           !(seenMap[m.id] || []).find(r => r.user_id === currentUser.id)
    )
    unseen.forEach(m => markMessageSeen(m.id, currentUser.id))
  }, [messages, currentUser]) // eslint-disable-line

  const buildSeenMap = (receipts) => {
    const map = {}
    receipts.forEach(r => {
      if (!map[r.message_id]) map[r.message_id] = []
      map[r.message_id].push(r)
    })
    setSeenMap(map)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close context menu on outside click or scroll
  useEffect(() => {
    const close = () => setMenuMsgId(null)
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)  // capture scroll anywhere
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    setReplyTo(null)
    const result = await sendMessage(subject.courseId, trimmed, replyTo?.id ?? null)
    if (!result.success) setText(trimmed)
    setSending(false)
    inputRef.current?.focus()
  }

  const handleEdit = async (msgId) => {
    const trimmed = editText.trim()
    if (!trimmed) return
    await editMessage(msgId, trimmed)
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, content: trimmed, edited_at: new Date().toISOString() } : m
    ))
    setEditingId(null)
    setEditText('')
  }

  const handleUnsend = async (msgId) => {
    await unsendMessage(msgId)
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, is_deleted: true, content: '' } : m
    ))
    setMenuMsgId(null)
  }

  const startEdit = (msg) => {
    setEditingId(msg.id)
    setEditText(msg.content)
    setMenuMsgId(null)
    setTimeout(() => document.getElementById(`edit-${msg.id}`)?.focus(), 50)
  }

  const startReply = (msg, senderName) => {
    const isOwnMsg = msg.sender_id === currentUser?.id
    const displayName = isOwnMsg ? 'You' : (senderName || 'Unknown')
    setReplyTo({ id: msg.id, content: msg.content, senderName: displayName })
    setMenuMsgId(null)
    inputRef.current?.focus()
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const formatDate = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const grouped = messages.reduce((acc, msg) => {
    const date = formatDate(msg.created_at)
    if (!acc[date]) acc[date] = []
    acc[date].push(msg)
    return acc
  }, {})

  const schedule = subject.schedule || null

  const seenByOthers = (msgId) => {
    const receipts = seenMap[msgId] || []
    return receipts
      .filter(r => r.user_id !== currentUser?.id)
      .map(r => r.profiles?.full_name || r.profiles?.email || 'Someone')
  }

  const getReplyPreview = (replyId) => {
    const orig = messages.find(m => m.id === replyId)
    if (!orig) return null
    // Try joined profile first, then fall back to checking if it's our own message
    const isOwnMsg = orig.sender_id === currentUser?.id
    const senderName = orig.profiles?.full_name
      || orig.profiles?.email
      || (isOwnMsg ? (currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || currentUser?.email?.split('@')[0] || 'You') : null)
      || 'Unknown'
    return {
      senderName: isOwnMsg ? 'You' : senderName,
      content: orig.is_deleted ? 'Message unsent' : orig.content,
    }
  }

  const NETIQUETTE = [
    { icon: '🤝', text: 'Be respectful and professional in all messages.' },
    { icon: '📝', text: 'Stay on topic — keep discussions relevant to the subject.' },
    { icon: '🔕', text: 'Avoid sending repeated or unnecessary messages.' },
    { icon: '✏️', text: 'Use proper grammar and avoid excessive abbreviations.' },
    { icon: '🚫', text: 'No hate speech, harassment, or offensive content.' },
    { icon: '📎', text: 'Cite sources when sharing information or files.' },
    { icon: '🔒', text: 'Do not share personal information of other students.' },
    { icon: '⏰', text: 'Respect message timing — avoid late-night non-urgent messages.' },
  ]

  return (
    <div className="home__thread-layout">

      {/* ── LEFT: Schedule + Members ── */}
      <aside className="home__thread-aside home__thread-aside--left">
        <div className="home__aside-header">
          <span className="home__aside-title">📅 Schedule</span>
        </div>
        <div className="home__aside-body">
          {schedule ? (
            <div className="home__schedule-info">
              {(schedule.days || schedule.time) && (
                <div className="home__schedule-badge">
                  {schedule.days && <span className="home__schedule-days">{schedule.days}</span>}
                  {schedule.time && <span className="home__schedule-time">{schedule.time}</span>}
                </div>
              )}
              {schedule.room && (
                <div className="home__schedule-row">
                  <span className="home__schedule-label">Room</span>
                  <span className="home__schedule-value">{schedule.room}</span>
                </div>
              )}
              <div className="home__schedule-row">
                <span className="home__schedule-label">Instructor</span>
                <span className="home__schedule-value">
                  {schedule.instructor
                    ? schedule.instructor
                    : <em style={{ color: '#94a3b8', fontSize: '12px' }}>Not set</em>
                  }
                </span>
              </div>
            </div>
          ) : (
            <p className="home__aside-empty">Schedule not available. Re-upload your COR to extract schedule information.</p>
          )}

          {/* ── Members ── */}
          <div className="home__members">
            <div className="home__members-header">
              <span className="home__schedule-label">Members</span>
              <span className="home__members-count">{members.length}</span>
            </div>
            <div className="home__members-list">
              {members.length === 0 && (
                <p className="home__aside-empty">No members yet.</p>
              )}
              {members.map(m => {
                const isMe = m.id === currentUser?.id
                const name = m.full_name || m.email?.split('@')[0] || 'Unknown'
                const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div
                    key={m.id}
                    className="home__member-item"
                    onClick={() => setViewingMember(m)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="home__member-avatar">
                      {m.avatar_url
                        ? <img src={m.avatar_url} alt={name} />
                        : <span>{initials}</span>
                      }
                    </div>
                    <span className="home__member-name">
                      {name}{isMe && <em className="home__member-you"> (You)</em>}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* ── CENTER: Chat ── */}
      <div className="home__thread">
        <div className="home__thread-header">
          <button type="button" className="home__thread-back" onClick={onBack} aria-label="Back">
            <BackIcon width={18} height={18} />
          </button>
          <div className="home__gc-icon home__gc-icon--sm">
            <ChatIcon width={15} height={15} />
          </div>
          <div className="home__thread-title">
            <span className="home__gc-code">{subject.code || 'Untitled'}</span>
            <span className="home__gc-desc">{subject.description}</span>
          </div>
          <button type="button"
            className={`home__netiquette-toggle ${showNetiquette ? 'home__netiquette-toggle--active' : ''}`}
            onClick={() => setShowNetiquette(v => !v)} title="Netiquette Guidelines">
            📋
          </button>
        </div>

        {showNetiquette && (
          <div className="home__netiquette-inline">
            <p className="home__netiquette-inline-title">Netiquette Guidelines</p>
            {NETIQUETTE.map((item, i) => (
              <div key={i} className="home__netiquette-inline-item">
                <span>{item.icon}</span><span>{item.text}</span>
              </div>
            ))}
          </div>
        )}

        <div className="home__thread-body">
          {messages.length === 0 && (
            <p className="home__thread-placeholder">No messages yet. Say hello to your classmates! 👋</p>
          )}

          {Object.entries(grouped).map(([date, msgs]) => (
            <div key={date} className="home__msg-group">
              <div className="home__thread-date">{date}</div>

              {msgs.map((msg) => {
                const isMe = msg.sender_id === currentUser?.id
                const senderName = msg.profiles?.full_name || msg.profiles?.email || 'Unknown'
                const seen = seenByOthers(msg.id)
                const replyPreview = msg.reply_to ? getReplyPreview(msg.reply_to) : null
                const isEditing = editingId === msg.id

                return (
                  <div key={msg.id} className={`home__msg ${isMe ? 'home__msg--me' : 'home__msg--them'}`}>
                    {!isMe && !msg.is_deleted && <span className="home__msg-sender">{senderName}</span>}

                    {/* Reply preview */}
                    {replyPreview && !msg.is_deleted && (
                      <div className={`home__msg-reply-preview ${isMe ? 'home__msg-reply-preview--me' : ''}`}>
                        <span className="home__msg-reply-name">{replyPreview.senderName}</span>
                        <span className="home__msg-reply-text">{replyPreview.content}</span>
                      </div>
                    )}

                    <div className="home__msg-row">
                      {/* Context menu trigger */}
                      {!msg.is_deleted && (
                        <button
                          type="button"
                          className="home__msg-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (menuMsgId === msg.id) {
                              setMenuMsgId(null)
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect()
                              // Place menu below the button, or above if too close to bottom
                              const menuHeight = isMe ? 110 : 46 // approx: 3 items vs 1 item
                              const spaceBelow = window.innerHeight - rect.bottom
                              const y = spaceBelow < menuHeight + 8
                                ? rect.top - menuHeight - 4   // flip up
                                : rect.bottom + 4             // open down
                              setMenuPos({ x: rect.left, y })
                              setMenuMsgId(msg.id)
                            }
                          }}
                          aria-label="Message options"
                        >⋯</button>
                      )}

                      {/* Bubble */}
                      {isEditing ? (
                        <div className="home__msg-edit-wrap">
                          <input
                            id={`edit-${msg.id}`}
                            className="home__msg-edit-input"
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleEdit(msg.id); if (e.key === 'Escape') { setEditingId(null) } }}
                          />
                          <div className="home__msg-edit-actions">
                            <button type="button" onClick={() => handleEdit(msg.id)}>Save</button>
                            <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className={`home__msg-bubble ${msg.is_deleted ? 'home__msg-bubble--deleted' : ''}`}>
                          {msg.is_deleted ? 'You unsent a message' : msg.content}
                        </div>
                      )}
                    </div>

                    <div className="home__msg-meta">
                      <span className="home__msg-time">{formatTime(msg.created_at)}</span>
                      {msg.edited_at && !msg.is_deleted && <span className="home__msg-edited">Edited</span>}
                    </div>

                    {/* Seen by — only show on sender's last seen message */}
                    {isMe && seen.length > 0 && (
                      <div className="home__msg-seen">
                        Seen by {seen.length <= 2 ? seen.join(' & ') : `${seen[0]} and ${seen.length - 1} others`}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* ── Fixed context menu — rendered outside overflow:hidden ── */}
        {menuMsgId && (() => {
          const msg = messages.find(m => m.id === menuMsgId)
          if (!msg) return null
          const isMe = msg.sender_id === currentUser?.id
          const senderName = msg.profiles?.full_name || msg.profiles?.email || 'Unknown'
          return (
            <div
              className="home__msg-menu home__msg-menu--fixed"
              style={{ top: menuPos.y, left: menuPos.x }}
              onClick={e => e.stopPropagation()}
            >
              <button type="button" onClick={() => startReply(msg, senderName)}>↩ Reply</button>
              {isMe && <button type="button" onClick={() => startEdit(msg)}>✏️ Edit</button>}
              {isMe && <button type="button" className="home__msg-menu-danger" onClick={() => handleUnsend(msg.id)}>🗑 Unsend</button>}
            </div>
          )
        })()}

        {/* Reply bar */}
        {replyTo && (
          <div className="home__reply-bar">
            <div className="home__reply-bar-inner">
              <span className="home__reply-bar-label">Replying to <strong>{replyTo.senderName}</strong></span>
              <span className="home__reply-bar-text">{replyTo.content}</span>
            </div>
            <button type="button" className="home__reply-bar-cancel" onClick={() => setReplyTo(null)} aria-label="Cancel reply">✕</button>
          </div>
        )}

        {/* Member profile modal */}
        {viewingMember && (
          <div
            className="home__modal-overlay"
            onClick={() => setViewingMember(null)}
          >
            <div
              className="home__modal-content"
              onClick={e => e.stopPropagation()}
            >
              <div className="home__modal-header">
                <h3>Member Profile</h3>
                <button
                  type="button"
                  className="home__modal-close"
                  onClick={() => setViewingMember(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="home__modal-body">
                <div className="home__modal-avatar">
                  {viewingMember.avatar_url
                    ? <img src={viewingMember.avatar_url} alt={viewingMember.full_name} />
                    : <span>{(viewingMember.full_name || viewingMember.email?.[0] || '?')[0]?.toUpperCase()}</span>
                  }
                </div>
                <div className="home__modal-info">
                  <p className="home__modal-name">{viewingMember.full_name || 'Unknown'}</p>
                  <p className="home__modal-email">{viewingMember.email}</p>
                  {viewingMember.student_id && (
                    <p className="home__modal-detail">ID: {viewingMember.student_id}</p>
                  )}
                  {viewingMember.department && (
                    <p className="home__modal-detail">Department: {viewingMember.department}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <form className="home__thread-input" onSubmit={handleSend}>
          <input
            ref={inputRef}
            type="text"
            placeholder={replyTo ? `Reply to ${replyTo.senderName}…` : 'Message…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={sending}
            autoComplete="off"
          />
          <button type="submit" disabled={!text.trim() || sending} aria-label="Send">
            <SendIcon width={17} height={17} />
          </button>
        </form>
      </div>

      {/* ── RIGHT: Netiquette ── */}
      <aside className="home__thread-aside home__thread-aside--right">
        <div className="home__aside-header">
          <span className="home__aside-title">📋 Netiquette</span>
        </div>
        <div className="home__aside-body">
          <p className="home__aside-intro">Guidelines for respectful online communication in this group chat.</p>
          <div className="home__netiquette-list">
            {NETIQUETTE.map((item, i) => (
              <div key={i} className="home__netiquette-item">
                <span className="home__netiquette-icon">{item.icon}</span>
                <span className="home__netiquette-text">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

    </div>
  )
}

function Home({ session }) {
  const [view, setView] = useState('loading')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [progress, setProgress] = useState(0)
  const [studentName, setStudentName] = useState('')
  const [subjects, setSubjects] = useState([])
  const [activeThread, setActiveThread] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)
  const toast = useToast()

  // On mount: session is guaranteed to exist (App.jsx only renders Home when
  // session is confirmed), so go straight to fetching enrollments.
  useEffect(() => {
    let cancelled = false

    const loadEnrollments = async () => {
      const result = await getStudentEnrollments()
      if (cancelled) return

      console.log('[Home] loadEnrollments result:', result)

      if (!result.success) {
        console.error('[Home] enrollment fetch failed:', result.error)
        if (!cancelled) setView('prompt')
        return
      }

      // Filter to enrollments that have a valid course attached
      const valid = (result.enrollments ?? []).filter(e => e.courses?.code)

      if (valid.length > 0) {
        const loaded = valid.map((e) => ({
          id: e.id,
          code: e.courses.code,
          description: e.courses.title || e.courses.code,
          courseId: e.course_id,
          schedule: e.courses.schedule || null,
        }))
        setSubjects(loaded)
        setView('chats')
      } else {
        setView('prompt')
      }
    }

    loadEnrollments()
    return () => { cancelled = true }
  }, [session?.user?.id])  // re-run if the logged-in user changes

  const handleFileSelect = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPG or PNG) of your COR.')
      return
    }
    setError('')
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    handleFileSelect(e.dataTransfer.files?.[0])
  }

  const handleRemoveSelectedFile = () => {
    setImageFile(null)
    setImagePreview(null)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const runOcr = async () => {
    if (!imageFile) return
    setView('processing')
    setProgress(10)
    setError('')

    const timer = setInterval(() => {
      setProgress((prev) => (prev < 90 ? prev + Math.floor(Math.random() * 8) + 3 : 90))
    }, 200)

    try {
      const formData = new FormData()
      formData.append('file', imageFile)

      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/api/scan-cor`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Unable to process the document. Please try again.')
      }

      const data = await response.json()

      clearInterval(timer)
      setProgress(100)

      // If nothing was extracted at all, treat as unextractable
      const hasName = !!data.name?.trim()
      const hasSubjects = data.subjects?.length > 0

      if (!hasName && !hasSubjects) {
        setError('Could not extract any information from this image. Please upload a clearer photo of your COR.')
        setView('upload')
        return
      }

      setStudentName(data.name || '')
      setSubjects(data.subjects || [])

      if (data.image_preview) {
        setImagePreview(data.image_preview)
      }

      if (!hasSubjects) {
        setError('No subjects could be detected. Please check or add them manually.')
      } else {
        toast.success(`COR scanned — ${data.subjects.length} subject${data.subjects.length !== 1 ? 's' : ''} detected.`)
      }

      setTimeout(() => setView('review'), 250)
    } catch (err) {
      clearInterval(timer)
      console.error(err)
      if (err.message?.includes('fetch') || err.name === 'TypeError') {
        setError('Scanning service is unavailable. Please start the Python backend server (see backend/README.md) or check if localhost:8000 is accessible.')
      } else {
        setError('Failed to scan COR. Please try again.')
      }
      setView('upload')
    }
  }

  const updateSubject = (id, field, value) => {
    setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }

  const removeSubject = (id) => {
    setSubjects((prev) => prev.filter((s) => s.id !== id))
  }

  const addSubjectManually = () => {
    setSubjects((prev) => [
      ...prev,
      { id: `manual-${Date.now()}`, code: '', description: '' },
    ])
  }

  const confirmSubjects = async () => {
    setSaving(true)
    try {
      const result = await saveStudentSubjects(studentName, subjects)
      if (result.success) {
        // Reload from DB so the GC list is DB-driven
        const fresh = await getStudentEnrollments()
        const valid = (fresh.enrollments ?? []).filter(e => e.courses?.code)
        if (fresh.success && valid.length > 0) {
          const loaded = valid.map((e) => ({
            id: e.id,
            code: e.courses.code,
            description: e.courses.title || e.courses.code,
            courseId: e.course_id,
            schedule: e.courses.schedule || null,
          }))
          setSubjects(loaded)
          toast.success(`Joined ${loaded.length} group chat${loaded.length !== 1 ? 's' : ''}!`)
        }
        setView('chats')
      } else {
        setError('Failed to save subjects: ' + result.error)
      }
    } catch (err) {
      console.error(err)
      setError('Failed to save subjects to database')
    } finally {
      setSaving(false)
    }
  }

  const startOver = () => {
    setView('upload')
    setImageFile(null)
    setImagePreview(null)
    setStudentName('')
    setError('')
    setProgress(0)
    // Don't clear subjects — keep existing enrollments visible
  }

  const openThread = (subject) => {
    setActiveThread(subject)
    setView('thread')
  }

  const backToChats = () => {
    setActiveThread(null)
    setView('chats')
  }

  return (
    <div className="home">
      {view === 'loading' && (
        <div className="home__card home__card--center">
          <div className="home__spinner" />
          <p className="home__subtitle">Loading your group chats…</p>
        </div>
      )}

      {view === 'prompt' && (
        <div className="home__card home__card--center">
          <div className="home__prompt-icon">
            <ChatIcon width={28} height={28} />
          </div>
          <h2 className="home__title">You haven't joined any group chats yet</h2>
          <p className="home__subtitle">
            Upload your Certificate of Registration (COR) and we'll automatically find and join the
            group chats for your enrolled subjects.
          </p>
          <button
            type="button"
            className="home__btn home__btn--primary"
            onClick={() => setView('upload')}
          >
            Find your GC
          </button>
        </div>
      )}

      {view === 'upload' && (
        <div className="home__card">
          <div className="home__upload-header">
            <button
              type="button"
              className="home__back-link"
              onClick={() => {
                setImageFile(null)
                setImagePreview(null)
                setError('')
                setView('prompt')
              }}
            >
              <BackIcon width={16} height={16} />
              Cancel
            </button>
          </div>

          <h2 className="home__title">Upload Your Certificate of Registration</h2>
          <p className="home__subtitle">
            We'll scan your COR to automatically find and join the group chats for your enrolled subjects.
          </p>

          {!imagePreview ? (
            <div
              className="home__dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <UploadIcon className="home__dropzone-icon" />
              <span className="home__dropzone-text">Click to upload or drag and drop</span>
              <span className="home__dropzone-hint">JPG or PNG, clear and well-lit</span>
            </div>
          ) : (
            <div className="home__preview-card">
              <div className="home__preview-frame">
                <img src={imagePreview} alt="COR Preview" className="home__preview-img" />
              </div>

              <div className="home__preview-info">
                <span className="home__filename">
                  📄 {imageFile?.name || 'Selected_COR.jpg'}
                </span>
                <button
                  type="button"
                  className="home__change-btn"
                  onClick={handleRemoveSelectedFile}
                >
                  Change File
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
          />

          {error && <p className="home__error">{error}</p>}

          <button
            type="button"
            className="home__btn home__btn--primary"
            onClick={runOcr}
            disabled={!imageFile}
          >
            Scan COR
          </button>
        </div>
      )}

      {view === 'processing' && (
        <div className="home__card home__card--center">
          <div className="home__spinner" />
          <h2 className="home__title">Scanning your COR</h2>
          <p className="home__subtitle">This may take a few seconds…</p>
          <div className="home__progress-track">
            <div className="home__progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {saving && (
        <div className="home__card home__card--center">
          <div className="home__spinner" />
          <h2 className="home__title">Joining Group Chats</h2>
          <p className="home__subtitle">This may take a few seconds…</p>
        </div>
      )}

      {view === 'review' && (
        <div className="home__card">
          <div className="home__review-header">
            <h2 className="home__title">Verify Extracted Details</h2>
            <p className="home__subtitle">
              Compare the extracted text below against your uploaded document.
            </p>
          </div>

          {error && <p className="home__error">{error}</p>}

          <div className="home__review-stacked">
            <div className="home__preview-panel">
              <span className="home__panel-title">Uploaded Document</span>
              {imagePreview && (
                <div className="home__image-wrapper">
                  <img src={imagePreview} alt="Uploaded COR" className="home__cor-image" />
                </div>
              )}
            </div>

            <div className="home__form-panel">
              <div className="home__field-group">
                <label className="home__label">Student Name</label>
                <input
                  type="text"
                  className="home__input"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g. SURNAME, FIRSTNAME MIDDLENAME."
                />
              </div>

              <span className="home__panel-title" style={{ marginTop: '16px' }}>
                Enrolled Subjects
              </span>
              <div className="home__table">
                <div className="home__table-header">
                  <span>Code</span>
                  <span>Description</span>
                  <span></span>
                </div>

                {subjects.map((subject) => (
                  <div key={subject.id} className="home__table-row">
                    <input
                      type="text"
                      value={subject.code}
                      onChange={(e) => updateSubject(subject.id, 'code', e.target.value.toUpperCase())}
                      placeholder="Code"
                    />
                    <input
                      type="text"
                      value={subject.description}
                      onChange={(e) => updateSubject(subject.id, 'description', e.target.value)}
                      placeholder="Description"
                    />
                    <button
                      type="button"
                      className="home__row-remove"
                      onClick={() => removeSubject(subject.id)}
                      aria-label="Remove subject"
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" className="home__add-row" onClick={addSubjectManually}>
                + Add missing subject
              </button>

              <div className="home__actions">
                <button type="button" className="home__btn home__btn--secondary" onClick={startOver}>
                  Re-upload Photo
                </button>
                <button
                  type="button"
                  className="home__btn home__btn--primary"
                  onClick={confirmSubjects}
                  disabled={subjects.length === 0 || saving}
                >
                  {saving ? 'Joining Group Chats...' : 'Confirm & Join Group Chats'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'chats' && (
        <div className="home__chats">
          <div className="home__chats-header">
            <h2 className="home__title">Your Group Chats</h2>
            <button type="button" className="home__reupload" onClick={startOver}>
              Re-upload COR
            </button>
          </div>

          <div className="home__gc-list">
            {subjects.map((subject) => (
              <button
                key={subject.id}
                type="button"
                className="home__gc-item"
                onClick={() => openThread(subject)}
              >
                <div className="home__gc-icon">
                  <ChatIcon width={18} height={18} />
                </div>
                <div className="home__gc-info">
                  <span className="home__gc-code">{subject.code || 'Untitled'}</span>
                  <span className="home__gc-desc">{subject.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'thread' && activeThread && (
        <ThreadView
          subject={activeThread}
          onBack={backToChats}
        />
      )}
    </div>
  )
}

export default Home