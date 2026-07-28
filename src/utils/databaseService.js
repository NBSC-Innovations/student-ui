import { supabase } from './supabaseClient'

const DEBUG = import.meta.env.DEV

const log = (...args) => {
  if (DEBUG) console.log(...args)
}

const logError = (...args) => {
  if (DEBUG) console.error(...args)
}

export async function saveStudentSubjects(studentName, subjects) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('User not authenticated')

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

    // ── Step 1: Get existing enrollments to compare ────────────
    const { data: existingEnrollments, error: fetchEnrollError } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('student_id', user.id)

    if (fetchEnrollError) {
      logError('Failed to fetch existing enrollments:', fetchEnrollError)
      throw new Error('Could not fetch existing enrollments: ' + fetchEnrollError.message)
    }

    // ── Step 2: Batch upsert courses ────────────────
    const validSubjects = subjects.filter(s => typeof s.code === 'string' && s.code.trim())
    if (validSubjects.length === 0) {
      throw new Error('No valid subjects to save')
    }

    const courseUpserts = validSubjects.map(subject => ({
      code: subject.code.trim().toUpperCase(),
      title: subject.description?.trim() || subject.code.trim().toUpperCase(),
      is_active: true,
      schedule: subject.schedule ?? null,
    }))

    const { data: upsertedCourses, error: upsertError } = await supabase
      .from('courses')
      .upsert(courseUpserts, { onConflict: 'code', ignoreDuplicates: false })
      .select('id, code')

    if (upsertError) {
      logError('Batch upsert failed:', upsertError)
      throw new Error('Could not upsert courses: ' + upsertError.message)
    }

    // Fetch all courses by codes to get IDs (handles RLS not returning data)
    const codes = validSubjects.map(s => s.code.trim().toUpperCase())
    const { data: courses, error: fetchError } = await supabase
      .from('courses')
      .select('id, code')
      .in('code', codes)

    if (fetchError) {
      logError('Failed to fetch courses:', fetchError)
      throw new Error('Could not fetch courses: ' + fetchError.message)
    }

    const courseMap = new Map(courses?.map(c => [c.code, c.id]) || [])

    if (courseMap.size === 0) {
      throw new Error('No courses found in database. Check if courses table is accessible.')
    }

    // ── Step 3: Batch insert enrollments ────────────────
    const enrollments = []
    const errors = []

    for (const subject of validSubjects) {
      const code = subject.code.trim().toUpperCase()
      const courseId = courseMap.get(code)

      if (!courseId) {
        logError('[Save] Course not found:', code)
        errors.push(code)
        continue
      }

      enrollments.push({ student_id: user.id, course_id: courseId, status: 'active' })
    }

    // Insert new enrollments BEFORE deleting old ones to avoid race condition
    if (enrollments.length > 0) {
      const { error: enrollError } = await supabase
        .from('enrollments')
        .insert(enrollments)

      if (enrollError) {
        logError('Batch enrollment insert failed:', enrollError)
        throw new Error('Could not insert enrollments: ' + enrollError.message)
      }
    }

    // Now delete old enrollments that are not in the new set
    const newCourseIds = enrollments.map(e => e.course_id)
    const { error: deleteError } = await supabase
      .from('enrollments')
      .delete()
      .eq('student_id', user.id)
      .not('course_id', 'in', `(${newCourseIds.join(',')})`)

    if (deleteError) {
      logError('Failed to delete old enrollments:', deleteError)
      // Non-critical error - log but don't fail the operation
    }

    log('[Save] Cleaned up old enrollments for', user.id)

    const savedSubjects = validSubjects
      .filter(s => {
        const code = typeof s.code === 'string' ? s.code.trim().toUpperCase() : null
        return code && courseMap.has(code)
      })
      .map(s => {
        const code = s.code.trim().toUpperCase()
        return {
          ...s,
          code,
          courseId: courseMap.get(code)
        }
      })

    log(`[Save] Done: ${savedSubjects.length} saved, ${errors.length} failed`, errors)

    if (savedSubjects.length === 0) {
      throw new Error('No subjects could be saved. Check RLS policies or database connection.')
    }

    return { success: true, subjects: savedSubjects }
  } catch (error) {
    logError('Error saving subjects:', error)
    return { success: false, error: error.message }
  }
}

export async function getStudentEnrollments() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    log('[DB] getUser ->', user?.id ?? 'NO USER', userError ?? '')
    if (userError) throw userError
    if (!user) throw new Error('User not authenticated')

    const { data: enrollments, error } = await supabase
      .from('enrollments')
      .select(`
        id,
        course_id,
        status,
        courses (
          id,
          code,
          title,
          schedule
        )
      `)
      .eq('student_id', user.id)
      .eq('status', 'active')
      .order('enrolled_at', { ascending: true })

    log('[DB] enrollments query error:', error)
    log('[DB] enrollments raw data:', JSON.stringify(enrollments, null, 2))

    if (error) throw error

    return { success: true, enrollments: enrollments ?? [] }
  } catch (error) {
    logError('[DB] getStudentEnrollments threw:', error.message)
    return { success: false, error: error.message, enrollments: [] }
  }
}

export async function getMessages(courseId) {
  try {
    const { data, error } = await supabase
      .from('gc_messages')
      .select(`
        id,
        content,
        created_at,
        edited_at,
        is_deleted,
        sender_id,
        reply_to,
        profiles ( full_name, email )
      `)
      .eq('course_id', courseId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return { success: true, messages: data }
  } catch (error) {
    logError('Error fetching messages:', error)
    return { success: false, error: error.message }
  }
}

export async function sendMessage(courseId, content, replyTo = null) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('gc_messages')
      .insert({ course_id: courseId, sender_id: user.id, content, reply_to: replyTo })
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
      .update({ content: newContent, edited_at: new Date().toISOString() })
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
      .update({ is_deleted: true, content: '' })
      .eq('id', messageId)
    if (error) throw error
    return { success: true }
  } catch (error) {
    logError('Error unsending message:', error)
    return { success: false, error: error.message }
  }
}

export async function markMessageSeen(messageId, userId) {
  try {
    const { error } = await supabase
      .from('gc_message_seen')
      .upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id', ignoreDuplicates: true })
    if (error) throw error
    return { success: true }
  } catch (error) {
    logError('Error marking message as seen:', error)
    return { success: false, error: error.message }
  }
}

export async function getSeenReceipts(courseId) {
  try {
    const { data, error } = await supabase
      .from('gc_message_seen')
      .select(`
        message_id,
        user_id,
        seen_at,
        profiles ( full_name, email ),
        gc_messages!inner ( course_id )
      `)
      .eq('gc_messages.course_id', courseId)
    if (error) throw error
    return { success: true, receipts: data }
  } catch (error) {
    logError('getSeenReceipts error:', error)
    return { success: false, receipts: [] }
  }
}

export function subscribeToMessages(courseId, onInsert, onUpdate) {
  return supabase
    .channel(`gc_messages:${courseId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'gc_messages', filter: `course_id=eq.${courseId}` },
      (payload) => onInsert(payload.new)
    )
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'gc_messages', filter: `course_id=eq.${courseId}` },
      (payload) => onUpdate?.(payload.new)
    )
    .subscribe()
}

export function subscribeToSeen(courseId, onSeen) {
  return supabase
    .channel(`gc_seen:${courseId}`)
    .on('postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'gc_message_seen',
        filter: `message_id=in.(select id from gc_messages where course_id=eq.${courseId})`
      },
      (payload) => onSeen?.(payload.new)
    )
    .subscribe()
}

// Fetch all students enrolled in a course (excluding the current user)
// Returns: { success, members: [{ id, full_name, email, avatar_url }], total }
export async function getCourseMembers(courseId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        student_id,
        profiles (
          id,
          full_name,
          email,
          avatar_url
        )
      `)
      .eq('course_id', courseId)
      .eq('status', 'active')

    if (error) throw error

    const members = (data ?? [])
      .map(e => e.profiles)
      .filter(Boolean)

    return { success: true, members, total: members.length }
  } catch (error) {
    logError('getCourseMembers error:', error)
    return { success: false, members: [], total: 0 }
  }
}

// Subscribe to enrollment changes for a course (someone joins/leaves)
export function subscribeToMembers(courseId, onChange) {
  return supabase
    .channel(`enrollments:${courseId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'enrollments', filter: `course_id=eq.${courseId}` },
      () => onChange?.()
    )
    .subscribe()
}
