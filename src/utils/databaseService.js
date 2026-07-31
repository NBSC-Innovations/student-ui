import { supabase } from './supabaseClient'

const DEBUG = import.meta.env.DEV

const log = (...args) => {
  if (DEBUG) console.log(...args)
}

const logError = (...args) => {
  if (DEBUG) console.error(...args)
}

export async function saveStudentSubjects(studentName, subjects, options = {}) {
  const { onProgress } = options

  try {
    onProgress?.({ stage: 'auth', progress: 0, total: subjects.length })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('User not authenticated')

    onProgress?.({ stage: 'profile', progress: 0, total: subjects.length })

    // Ensure profile exists (handle case where trigger didn't fire)
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileCheckError) {
      logError('Profile check error:', profileCheckError)
    }

    if (!existingProfile) {
      log('[Save] Profile missing, creating...')
      const { error: createProfileError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email,
          full_name: studentName || user.user_metadata?.full_name || user.user_metadata?.name || '',
          role: 'student',
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        })
      if (createProfileError) {
        logError('Failed to create profile:', createProfileError)
        throw new Error('Could not create user profile: ' + createProfileError.message)
      }
    } else if (studentName || user.user_metadata?.avatar_url || user.user_metadata?.picture) {
      // Always sync avatar from metadata, and update name if provided
      const updateData = {
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
      }
      if (studentName) {
        updateData.full_name = studentName
      }
      const { error: profileError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
      if (profileError) logError('Could not update profile:', profileError.message)
    }

    onProgress?.({ stage: 'fetch_existing', progress: 0, total: subjects.length })

    // ── Step 1: Get existing enrollments to compare ────────────
    const { data: existingEnrollments, error: fetchEnrollError } = await supabase
      .from('section_enrollments')
      .select('section_id')
      .eq('student_id', user.id)

    if (fetchEnrollError) {
      logError('Failed to fetch existing enrollments:', fetchEnrollError)
      throw new Error('Could not fetch existing enrollments: ' + fetchEnrollError.message)
    }

    onProgress?.({ stage: 'upsert_courses', progress: 0, total: validSubjects.length })

    // ── Step 2: Find or create sections for each subject code ────────────────
    const validSubjects = subjects.filter(s => typeof s.code === 'string' && s.code.trim())
    if (validSubjects.length === 0) {
      throw new Error('No valid subjects to save')
    }

    // First, ensure courses exist for the subject codes
    const courseUpserts = validSubjects.map(subject => ({
      code: subject.code.trim().toUpperCase(),
      title: subject.description?.trim() || subject.code.trim().toUpperCase(),
    }))

    // Chunk the upsert to handle large datasets (Supabase limit ~1000-2000 rows)
    const CHUNK_SIZE = 500
    let upsertError = null
    let upsertedCount = 0
    for (let i = 0; i < courseUpserts.length; i += CHUNK_SIZE) {
      const chunk = courseUpserts.slice(i, i + CHUNK_SIZE)
      const { error: chunkError } = await supabase
        .from('courses')
        .upsert(chunk, { onConflict: 'code', ignoreDuplicates: false })
      if (chunkError) {
        upsertError = chunkError
        break
      }
      upsertedCount += chunk.length
      onProgress?.({ stage: 'upsert_courses', progress: upsertedCount, total: courseUpserts.length })
    }

    if (upsertError) {
      logError('Batch upsert failed:', upsertError)
      throw new Error('Could not upsert courses: ' + upsertError.message)
    }

    onProgress?.({ stage: 'fetch_courses', progress: 0, total: validSubjects.length })

    // Fetch all courses by codes to get IDs
    const codes = validSubjects.map(s => s.code.trim().toUpperCase())
    const FETCH_CHUNK_SIZE = 500
    let allCourses = []
    let fetchError = null
    let fetchedCount = 0

    for (let i = 0; i < codes.length; i += FETCH_CHUNK_SIZE) {
      const codeChunk = codes.slice(i, i + FETCH_CHUNK_SIZE)
      const { data: courses, error: chunkError } = await supabase
        .from('courses')
        .select('id, code')
        .in('code', codeChunk)
      if (chunkError) {
        fetchError = chunkError
        break
      }
      allCourses = allCourses.concat(courses || [])
      fetchedCount += codeChunk.length
      onProgress?.({ stage: 'fetch_courses', progress: fetchedCount, total: codes.length })
    }

    if (fetchError) {
      logError('Failed to fetch courses:', fetchError)
      throw new Error('Could not fetch courses: ' + fetchError.message)
    }

    const courseMap = new Map(allCourses?.map(c => [c.code, c.id]) || [])

    if (courseMap.size === 0) {
      throw new Error('No courses found in database. Check if courses table is accessible.')
    }

    // Now find or create sections for each course
    onProgress?.({ stage: 'find_sections', progress: 0, total: validSubjects.length })
    const sectionMap = new Map()
    const sectionErrors = []

    for (const subject of validSubjects) {
      const code = subject.code.trim().toUpperCase()
      const courseId = courseMap.get(code)
      if (!courseId) {
        sectionErrors.push(code)
        continue
      }

      // Try to find existing section with this course and name
      const { data: existingSection, error: sectionError } = await supabase
        .from('sections')
        .select('id')
        .eq('course_id', courseId)
        .eq('name', code)
        .maybeSingle()

      if (sectionError && sectionError.code !== 'PGRST116') {
        logError('Error finding section:', sectionError)
        sectionErrors.push(code)
        continue
      }

      if (existingSection) {
        sectionMap.set(code, existingSection.id)
      } else {
        // Create new section
        const { data: newSection, error: createError } = await supabase
          .from('sections')
          .insert({
            course_id: courseId,
            name: code,
          })
          .select('id')
          .single()

        if (createError) {
          logError('Error creating section:', createError)
          sectionErrors.push(code)
          continue
        }
        sectionMap.set(code, newSection.id)
      }
      onProgress?.({ stage: 'find_sections', progress: sectionMap.size, total: validSubjects.length })
    }

    onProgress?.({ stage: 'insert_enrollments', progress: 0, total: validSubjects.length })

    // ── Step 3: Batch insert section enrollments ────────────────
    const enrollments = []
    const errors = sectionErrors

    for (const subject of validSubjects) {
      const code = subject.code.trim().toUpperCase()
      const sectionId = sectionMap.get(code)

      if (!sectionId) {
        logError('[Save] Section not found:', code)
        errors.push(code)
        continue
      }

      enrollments.push({ student_id: user.id, section_id: sectionId, status: 'active' })
    }

    // Insert new enrollments BEFORE deleting old ones to avoid race condition
    // Chunk the insert to handle large datasets (Supabase limit ~1000-2000 rows)
    if (enrollments.length > 0) {
      const ENROLL_CHUNK_SIZE = 500
      let enrollError = null
      let insertedCount = 0
      for (let i = 0; i < enrollments.length; i += ENROLL_CHUNK_SIZE) {
        const chunk = enrollments.slice(i, i + ENROLL_CHUNK_SIZE)
        const { error: chunkError } = await supabase
          .from('section_enrollments')
          .insert(chunk)
        if (chunkError) {
          enrollError = chunkError
          break
        }
        insertedCount += chunk.length
        onProgress?.({ stage: 'insert_enrollments', progress: insertedCount, total: enrollments.length })
      }

      if (enrollError) {
        logError('Batch enrollment insert failed:', enrollError)
        throw new Error('Could not insert enrollments: ' + enrollError.message)
      }
    }

    // Now delete old enrollments that are not in the new set
    const newSectionIds = enrollments.map(e => e.section_id)
    const { error: deleteError } = await supabase
      .from('section_enrollments')
      .delete()
      .eq('student_id', user.id)
      .not('section_id', 'in', `(${newSectionIds.join(',')})`)

    if (deleteError) {
      logError('Failed to delete old enrollments:', deleteError)
      // Non-critical error - log but don't fail the operation
    }

    log('[Save] Cleaned up old enrollments for', user.id)

    const savedSubjects = validSubjects
      .filter(s => {
        const code = typeof s.code === 'string' ? s.code.trim().toUpperCase() : null
        return code && sectionMap.has(code)
      })
      .map(s => {
        const code = s.code.trim().toUpperCase()
        return {
          ...s,
          code,
          courseId: courseMap.get(code),
          sectionId: sectionMap.get(code)
        }
      })

    log(`[Save] Done: ${savedSubjects.length} saved, ${errors.length} failed`, errors)

    if (savedSubjects.length === 0) {
      throw new Error('No subjects could be saved. Check RLS policies or database connection.')
    }

    onProgress?.({ stage: 'complete', progress: savedSubjects.length, total: validSubjects.length })

    return { success: true, subjects: savedSubjects }
  } catch (error) {
    logError('Error saving subjects:', error)
    return { success: false, error: error.message }
  }
}

export async function getMessages(sectionId) {
  try {
    // Fetch messages from gc_messages for this section
    const { data, error } = await supabase
      .from('gc_messages')
      .select('*')
      .eq('section_id', sectionId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })

    if (error) throw error

    // Fetch sender profiles for each message
    const messagesWithProfiles = await Promise.all(
      (data || []).map(async (msg) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email, role')
          .eq('id', msg.sender_id)
          .single()
        return {
          ...msg,
          profiles: profile
        }
      })
    )

    return { success: true, messages: messagesWithProfiles }
  } catch (error) {
    logError('Error fetching messages:', error)
    return { success: false, error: error.message }
  }
}

export async function sendMessage(sectionId, content, replyTo = null) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Not authenticated')

    // Insert message into gc_messages
    const { data, error } = await supabase
      .from('gc_messages')
      .insert({
        section_id: sectionId,
        sender_id: user.id,
        content: content,
        is_pinned: false,
        is_deleted: false,
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, message: data }
  } catch (error) {
    logError('Error sending message:', error)
    return { success: false, error: error.message }
  }
}

export async function editMessage(messageId, newContent) {
  try {
    const { error } = await supabase
      .from('gc_messages')
      .update({ content: newContent, edited_at: new Date() })
      .eq('id', messageId)
    if (error) throw error
    return { success: true }
  } catch (error) {
    logError('Error editing message:', error)
    return { success: false, error: error.message }
  }
}

export async function unsendMessage(messageId) {
  try {
    const { error } = await supabase
      .from('gc_messages')
      .update({ is_deleted: true })
      .eq('id', messageId)
    if (error) throw error
    return { success: true }
  } catch (error) {
    logError('Error unsending message:', error)
    return { success: false, error: error.message }
  }
}

export async function pinMessage(messageId) {
  try {
    const { error } = await supabase
      .from('gc_messages')
      .update({ is_pinned: true })
      .eq('id', messageId)
    if (error) throw error
    return { success: true }
  } catch (error) {
    logError('Error pinning message:', error)
    return { success: false, error: error.message }
  }
}

export async function unpinMessage(messageId) {
  try {
    const { error } = await supabase
      .from('gc_messages')
      .update({ is_pinned: false })
      .eq('id', messageId)
    if (error) throw error
    return { success: true }
  } catch (error) {
    logError('Error unpinning message:', error)
    return { success: false, error: error.message }
  }
}

export async function markMessageSeen(messageId, userId) {
  try {
    // Temporarily disabled - gc_message_seen table was dropped
    // TODO: Re-implement message seen tracking if needed
    return { success: true }
  } catch (error) {
    logError('Error marking message as seen:', error)
    return { success: false, error: error.message }
  }
}

export async function getSeenReceipts(courseId) {
  // Not implemented in new schema - seen receipts not in instructor schema
  return { success: true, receipts: [] }
}

export function subscribeToMessages(sectionId, onInsert, onUpdate) {
  // Subscribe to gc_messages table directly
  return supabase
    .channel(`gc_messages:${sectionId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'gc_messages' },
      (payload) => {
        if (payload.new.section_id === sectionId) {
          onInsert(payload.new)
        }
      }
    )
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'gc_messages' },
      (payload) => {
        if (payload.new.section_id === sectionId) {
          onUpdate?.(payload.new)
        }
      }
    )
    .subscribe()
}

export function subscribeToSeen(courseId, onSeen) {
  // Not implemented in new schema
  return { unsubscribe: () => {} }
}

// Fetch all members in a section (students + instructor)
// Returns: { success, members: [{ id, full_name, email, avatar_url, role }], total }
export async function getCourseMembers(sectionId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Not authenticated')

    // Fetch enrolled students
    const { data: enrollments, error: enrollError } = await supabase
      .from('section_enrollments')
      .select(`
        student_id,
        profiles (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `)
      .eq('section_id', sectionId)
      .eq('status', 'active')

    if (enrollError) throw enrollError

    const members = (enrollments ?? [])
      .map(e => ({ ...e.profiles, role: e.profiles.role || 'student' }))
      .filter(Boolean)

    // Fetch section instructor
    const { data: section, error: sectionError } = await supabase
      .from('sections')
      .select('instructor_id')
      .eq('id', sectionId)
      .single()

    if (!sectionError && section?.instructor_id) {
      // Fetch instructor profile separately
      const { data: instructor, error: instructorError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, role')
        .eq('id', section.instructor_id)
        .single()

      if (!instructorError && instructor) {
        // Add instructor if not already in the list
        if (!members.find(m => m.id === instructor.id)) {
          members.unshift({ ...instructor, role: instructor.role || 'instructor' })
        }
      }
    }

    return { success: true, members, total: members.length }
  } catch (error) {
    logError('getCourseMembers error:', error)
    return { success: false, members: [], total: 0 }
  }
}

// Subscribe to enrollment changes for a section (someone joins/leaves)
export function subscribeToMembers(sectionId, onChange) {
  return supabase
    .channel(`section_enrollments:${sectionId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'section_enrollments', filter: `section_id=eq.${sectionId}` },
      () => onChange?.()
    )
    .subscribe()
}

// Get recent messages for dashboard preview (last message per section)
export async function getRecentMessages(sectionIds) {
  try {
    if (!sectionIds || sectionIds.length === 0) {
      return { success: true, messages: [] }
    }

    const { data, error } = await supabase
      .from('gc_messages')
      .select(`
        id,
        content,
        created_at,
        section_id,
        sender_id,
        is_pinned
      `)
      .in('section_id', sectionIds)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error

    // Get only the most recent message per section
    const latestBySection = {}
    data?.forEach(msg => {
      const sectionId = msg.section_id
      if (sectionId && (!latestBySection[sectionId] || new Date(msg.created_at) > new Date(latestBySection[sectionId].created_at))) {
        latestBySection[sectionId] = { ...msg }
      }
    })

    // Fetch section info and sender profiles for each message
    const messagesWithDetails = await Promise.all(
      Object.values(latestBySection).map(async (msg) => {
        const [{ data: section }, { data: profile }] = await Promise.all([
          supabase.from('sections').select('id, name, courses!inner(code, title)').eq('id', msg.section_id).single(),
          supabase.from('profiles').select('full_name, role').eq('id', msg.sender_id).single()
        ])
        return {
          ...msg,
          sections: section,
          profiles: profile
        }
      })
    )

    return { success: true, messages: messagesWithDetails }
  } catch (error) {
    logError('Error fetching recent messages:', error)
    return { success: false, messages: [] }
  }
}

// Update user profile with name and avatar
export async function updateProfile(fullName, avatarUrl) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Not authenticated')

    const updateData = {}
    if (fullName) updateData.full_name = fullName
    if (avatarUrl) updateData.avatar_url = avatarUrl

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)

    if (error) throw error

    return { success: true }
  } catch (error) {
    logError('Error updating profile:', error)
    return { success: false, error: error.message }
  }
}

// Find section by section code and return with linked course
export async function findSectionByCode(sectionCode) {
  try {
    const { data, error } = await supabase
      .from('sections')
      .select(`
        id,
        name,
        room,
        max_capacity,
        courses (
          id,
          code,
          title
        )
      `)
      .ilike('name', sectionCode.trim())
      .maybeSingle()

    if (error) throw error

    if (!data) {
      return { success: false, error: 'Section not found' }
    }

    return { success: true, section: data }
  } catch (error) {
    logError('Error finding section:', error)
    return { success: false, error: error.message }
  }
}

// Create a new section (for students to create group chats)
export async function createSection(sectionName, description = null) {
  try {
    const { data, error } = await supabase
      .from('sections')
      .insert({
        name: sectionName.trim(),
        description: description?.trim() || null,
        room: null,
        max_capacity: 50,
      })
      .select('id, name')
      .single()

    if (error) throw error

    return { success: true, section: data }
  } catch (error) {
    logError('Error creating section:', error)
    return { success: false, error: error.message }
  }
}

// Get all courses for dropdown
export async function getAllCourses() {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('id, code, title')
      .order('code', { ascending: true })

    if (error) throw error

    return { success: true, courses: data || [] }
  } catch (error) {
    logError('Error fetching courses:', error)
    return { success: false, error: error.message, courses: [] }
  }
}

// Enroll student in a section
export async function enrollInSection(sectionId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Not authenticated')

    // Check if already enrolled
    const { data: existing, error: checkError } = await supabase
      .from('section_enrollments')
      .select('id')
      .eq('student_id', user.id)
      .eq('section_id', sectionId)
      .maybeSingle()

    if (checkError && checkError.code !== 'PGRST116') throw checkError

    if (existing) {
      return { success: true, alreadyEnrolled: true }
    }

    // Create enrollment
    const { error: enrollError } = await supabase
      .from('section_enrollments')
      .insert({
        student_id: user.id,
        section_id: sectionId,
        status: 'active'
      })

    if (enrollError) throw enrollError

    return { success: true, alreadyEnrolled: false }
  } catch (error) {
    logError('Error enrolling in section:', error)
    return { success: false, error: error.message }
  }
}

export async function leaveSection(sectionId) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'User not authenticated' }

    // Delete enrollment record for this student and section
    const { error } = await supabase
      .from('section_enrollments')
      .delete()
      .eq('student_id', user.id)
      .eq('section_id', sectionId)

    if (error) {
      console.error('Supabase delete error:', error)
      throw error
    }
    return { success: true }
  } catch (err) {
    console.error('Error leaving section:', err)
    return { success: false, error: err.message }
  }
}

// Get student enrollments with section information
export async function getStudentEnrollments() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('section_enrollments')
      .select(`
        id,
        section_id,
        status,
        sections (
          id,
          name,
          description,
          courses (
            id,
            code,
            title
          )
        )
      `)
      .eq('student_id', user.id)
      .eq('status', 'active')

    if (error) throw error

    log('[DB] enrollments raw data:', data)

    return { success: true, enrollments: data ?? [] }
  } catch (error) {
    logError('[DB] enrollments query error:', error)
    return { success: false, error: error.message, enrollments: [] }
  }
}

// Sync profile from auth metadata (call this on app load)
export async function syncProfileFromAuth() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) {
      logError('[Profile] Auth error:', userError)
      // If user doesn't exist in auth, return gracefully
      if (userError.message?.includes('does not exist') || userError.status === 403) {
        return { success: false, error: 'Session expired. Please sign in again.' }
      }
      throw userError
    }
    if (!user) return { success: false, error: 'Not authenticated' }

    log('[Profile] Auth user metadata:', user.user_metadata)
    log('[Profile] Auth email:', user.email)

    // Get current profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, avatar_url, student_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) throw profileError

    log('[Profile] Current profile:', profile)

    // Always try to get a better name from auth metadata with fallbacks
    const authName = user.user_metadata?.full_name ||
                    user.user_metadata?.name ||
                    `${user.user_metadata?.given_name || ''} ${user.user_metadata?.family_name || ''}`.trim() ||
                    user.user_metadata?.given_name
    const authAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture

    // If auth has a name, use it (even if profile exists)
    // If auth has no name, use email prefix but clean it up
    const newName = authName || (user.email?.split('@')[0]?.replace(/^student/i, '').trim() || user.email?.split('@')[0])
    const newAvatar = authAvatar || null

    const needsUpdate = !profile ||
                       !profile.full_name ||
                       profile.full_name.startsWith('Student') ||
                       (authName && profile.full_name !== authName) ||
                       (authAvatar && profile.avatar_url !== authAvatar)

    if (needsUpdate && profile) {
      const updateData = {
        full_name: newName,
        avatar_url: newAvatar,
      }

      log('[Profile] Update data:', updateData)

      // Update existing profile (trigger handles creation)
      const { error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
      if (updateError) throw updateError

      log('[Profile] Synced from auth metadata')
    }

    return { success: true, profile: { ...profile, full_name: newName, avatar_url: newAvatar } }
  } catch (error) {
    logError('Error syncing profile:', error)
    return { success: false, error: error.message }
  }
}
