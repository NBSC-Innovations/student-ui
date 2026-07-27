import { useState, useEffect, useRef } from 'react'
import '../styles/Home.css'
import { saveStudentSubjects, getStudentEnrollments, getMessages, sendMessage, subscribeToMessages } from '../utils/databaseService'

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
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    // Get current user for sender detection
    import('../utils/supabaseClient').then(({ supabase }) => {
      supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user))
    })

    // Load existing messages
    getMessages(subject.courseId).then((result) => {
      if (result.success) setMessages(result.messages)
    })

    // Subscribe to new messages in real time
    const channel = subscribeToMessages(subject.courseId, (newMsg) => {
      setMessages((prev) => [...prev, newMsg])
    })

    return () => channel.unsubscribe()
  }, [subject.courseId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    const result = await sendMessage(subject.courseId, trimmed)
    if (!result.success) {
      setText(trimmed) // restore on failure
    }
    setSending(false)
  }

  const formatTime = (iso) => {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (iso) => {
    const d = new Date(iso)
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Group messages by date
  const grouped = messages.reduce((acc, msg) => {
    const date = formatDate(msg.created_at)
    if (!acc[date]) acc[date] = []
    acc[date].push(msg)
    return acc
  }, {})

  return (
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
      </div>

      <div className="home__thread-body">
        {messages.length === 0 && (
          <p className="home__thread-placeholder">
            No messages yet. Say hello to your classmates! 👋
          </p>
        )}

        {Object.entries(grouped).map(([date, msgs]) => (
          <div key={date}>
            <div className="home__thread-date">{date}</div>
            {msgs.map((msg) => {
              const isMe = msg.sender_id === currentUser?.id
              const senderName = msg.profiles?.full_name || msg.profiles?.email || 'Unknown'
              return (
                <div key={msg.id} className={`home__msg ${isMe ? 'home__msg--me' : 'home__msg--them'}`}>
                  {!isMe && <span className="home__msg-sender">{senderName}</span>}
                  <div className="home__msg-bubble">{msg.content}</div>
                  <span className="home__msg-time">{formatTime(msg.created_at)}</span>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="home__thread-input" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Message…"
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
  )
}

function Home() {
  const [view, setView] = useState('loading')   // start in loading state
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [progress, setProgress] = useState(0)
  const [studentName, setStudentName] = useState('')
  const [subjects, setSubjects] = useState([])
  const [activeThread, setActiveThread] = useState(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  // On mount: load existing enrollments from DB
  useEffect(() => {
    const loadEnrollments = async () => {
      const result = await getStudentEnrollments()
      if (result.success && result.enrollments?.length > 0) {
        // Map enrollments → subject shape the rest of the UI expects
        const loaded = result.enrollments.map((e) => ({
          id: e.id,
          code: e.courses?.code || '',
          description: e.courses?.title || '',
          courseId: e.course_id,
        }))
        setSubjects(loaded)
        setView('chats')
      } else {
        setView('prompt')
      }
    }
    loadEnrollments()
  }, [])

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
        throw new Error('Failed to parse document on backend server.')
      }

      const data = await response.json()

      clearInterval(timer)
      setProgress(100)

      setStudentName(data.name || '')
      setSubjects(data.subjects || [])

      if (data.image_preview) {
        setImagePreview(data.image_preview)
      }

      if (!data.subjects || data.subjects.length === 0) {
        setError('No subjects could be detected from this image. Please check or add subjects manually.')
      }

      setTimeout(() => {
        setView('review')
      }, 250)
    } catch (err) {
      clearInterval(timer)
      console.error(err)
      if (err.message?.includes('fetch') || err.name === 'TypeError') {
        setError('Cannot reach the OCR backend. Run: cd backend && uvicorn main:app --reload --port 8000')
      } else {
        setError('Failed to scan COR: ' + (err.message || 'Unknown error'))
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
    try {
      const result = await saveStudentSubjects(studentName, subjects)
      if (result.success) {
        // Reload from DB so the GC list is DB-driven
        const fresh = await getStudentEnrollments()
        if (fresh.success && fresh.enrollments?.length > 0) {
          const loaded = fresh.enrollments.map((e) => ({
            id: e.id,
            code: e.courses?.code || '',
            description: e.courses?.title || '',
            courseId: e.course_id,
          }))
          setSubjects(loaded)
        }
        setView('chats')
      } else {
        setError('Failed to save subjects: ' + result.error)
      }
    } catch (err) {
      console.error(err)
      setError('Failed to save subjects to database')
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
          <h2 className="home__title">Processing your COR...</h2>
          <p className="home__subtitle">Running OpenCV preprocessing & OCR analysis.</p>
          <div className="home__progress-track">
            <div className="home__progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="home__progress-label">{progress}%</span>
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
                      onChange={(e) => updateSubject(subject.id, 'code', e.target.value)}
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
                  disabled={subjects.length === 0}
                >
                  Confirm & Join Group Chats
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