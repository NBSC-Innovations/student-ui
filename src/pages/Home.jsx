import { useState, useRef } from 'react'
import '../styles/Home.css'
import { saveStudentSubjects } from '../utils/databaseService'

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

function Home() {
  const [view, setView] = useState('prompt')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [progress, setProgress] = useState(0)
  const [studentName, setStudentName] = useState('')
  const [subjects, setSubjects] = useState([])
  const [activeThread, setActiveThread] = useState(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

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

      const response = await fetch('http://localhost:8000/api/scan-cor', {
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
      setError('Failed to scan COR. Make sure your Python backend server is running on port 8000.')
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
        setView('chats')
      } else {
        setError('Failed to save subjects to database: ' + result.error)
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
    setSubjects([])
    setError('')
    setProgress(0)
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
        <div className="home__thread">
          <div className="home__thread-header">
            <button type="button" className="home__thread-back" onClick={backToChats} aria-label="Back">
              <BackIcon width={18} height={18} />
            </button>
            <div className="home__gc-icon home__gc-icon--sm">
              <ChatIcon width={15} height={15} />
            </div>
            <div className="home__thread-title">
              <span className="home__gc-code">{activeThread.code || 'Untitled'}</span>
              <span className="home__gc-desc">{activeThread.description}</span>
            </div>
          </div>

          <div className="home__thread-body">
            <p className="home__thread-placeholder">
              This is the start of your class group chat. Messaging isn't wired up yet — this is a
              placeholder screen.
            </p>
          </div>

          <div className="home__thread-input">
            <input type="text" placeholder="Message..." disabled />
            <button type="button" disabled aria-label="Send">
              <SendIcon width={17} height={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Home