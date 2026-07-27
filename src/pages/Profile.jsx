import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabaseClient'
import { getStudentEnrollments } from '../utils/databaseService'
import '../styles/Profile.css'

function EditIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

function SaveIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function BookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  )
}

function Profile({ session }) {
  const [editing, setEditing]       = useState(false)
  const [fullName, setFullName]     = useState('')
  const [studentId, setStudentId]   = useState('')
  const [department, setDepartment] = useState('')
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')
  const [enrollments, setEnrollments] = useState([])
  const [loadingEnroll, setLoadingEnroll] = useState(true)

  const user = session?.user
  const email = user?.email || ''

  // Extract student ID from email — numbers before the @ (e.g. 2023001234@nbsc.edu.ph → 2023001234)
  const emailStudentId = email.match(/^(\d+)@/)?.[1] || ''

  // Avatar: prefer Google photo, fall back to initial
  const avatarUrl = user?.user_metadata?.avatar_url
    || user?.user_metadata?.picture
    || null

  const displayName = fullName
    || user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || email.split('@')[0]

  // Load profile from DB and auto-sync avatar from metadata
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('full_name, student_id, department, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setFullName(data.full_name || '')
          // Use DB student_id if set, otherwise auto-fill from email
          setStudentId(data.student_id || emailStudentId)
          setDepartment(data.department || '')

          // Auto-sync avatar from metadata if missing or different
          const metadataAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture
          if (metadataAvatar && data.avatar_url !== metadataAvatar) {
            supabase
              .from('profiles')
              .update({ avatar_url: metadataAvatar })
              .eq('id', user.id)
              .then(({ error }) => {
                if (error) console.error('Failed to sync avatar:', error)
              })
          }
        } else {
          setStudentId(emailStudentId)
        }
      })
  }, [user, emailStudentId])

  // Load enrollments
  useEffect(() => {
    getStudentEnrollments().then((result) => {
      if (result.success) setEnrollments(result.enrollments || [])
      setLoadingEnroll(false)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg('')
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        student_id: studentId,
        department,
        avatar_url: user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null,
      })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      setSaveMsg('Failed to save: ' + error.message)
    } else {
      setSaveMsg('Profile updated!')
      setEditing(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  return (
    <div className="profile">

      {/* ── Header card ── */}
      <div className="profile__header-card">
        <div className="profile__avatar">
          {avatarUrl
            ? <img src={avatarUrl} alt={displayName} referrerPolicy="no-referrer" />
            : <span>{(email[0] ?? '?').toUpperCase()}</span>
          }
        </div>

        <div className="profile__header-info">
          <h2 className="profile__name">{displayName}</h2>
          <p className="profile__email">{email}</p>
          {studentId && <p className="profile__student-id">ID: {studentId}</p>}
          {department && <p className="profile__dept">{department}</p>}
        </div>

        <button
          type="button"
          className={`profile__edit-btn ${editing ? 'profile__edit-btn--active' : ''}`}
          onClick={() => editing ? handleSave() : setEditing(true)}
          disabled={saving}
        >
          {editing
            ? <><SaveIcon width={15} height={15} /> {saving ? 'Saving…' : 'Save'}</>
            : <><EditIcon width={15} height={15} /> Edit</>
          }
        </button>
      </div>

      {saveMsg && (
        <div className={`profile__msg ${saveMsg.startsWith('Failed') ? 'profile__msg--error' : 'profile__msg--success'}`}>
          {saveMsg}
        </div>
      )}

      {/* ── Info fields ── */}
      <div className="profile__section">
        <h3 className="profile__section-title">Personal Information</h3>
        <div className="profile__fields">

          <div className="profile__field">
            <label className="profile__label">Full Name</label>
            {editing
              ? <input className="profile__input" value={fullName}
                  onChange={e => setFullName(e.target.value)} placeholder="e.g. DELA CRUZ, JUAN A." />
              : <span className="profile__value">{fullName || <span className="profile__empty">Not set</span>}</span>
            }
          </div>

          <div className="profile__field">
            <label className="profile__label">Email Address</label>
            <span className="profile__value">{email}</span>
          </div>

          <div className="profile__field">
            <label className="profile__label">Student ID</label>
            <span className="profile__value">
              {studentId || <span className="profile__empty">No number found in email</span>}
            </span>
          </div>

          <div className="profile__field">
            <label className="profile__label">Department / Course</label>
            {editing
              ? <input className="profile__input" value={department}
                  onChange={e => setDepartment(e.target.value)} placeholder="e.g. BSIT" />
              : <span className="profile__value">{department || <span className="profile__empty">Not set</span>}</span>
            }
          </div>

        </div>
      </div>

      {/* ── Enrolled subjects ── */}
      <div className="profile__section">
        <h3 className="profile__section-title">Enrolled Subjects</h3>

        {loadingEnroll ? (
          <p className="profile__empty">Loading…</p>
        ) : enrollments.length === 0 ? (
          <p className="profile__empty">No enrolled subjects found. Upload your COR from the Home page.</p>
        ) : (
          <div className="profile__subjects">
            {enrollments.map((e) => (
              <div key={e.id} className="profile__subject-row">
                <div className="profile__subject-icon">
                  <BookIcon width={16} height={16} />
                </div>
                <div className="profile__subject-info">
                  <span className="profile__subject-code">{e.courses?.code}</span>
                  <span className="profile__subject-title">{e.courses?.title}</span>
                </div>
                <span className="profile__subject-badge">{e.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

export default Profile
