import { supabase } from './supabaseClient'

export async function saveStudentSubjects(studentName, subjects) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('User not authenticated')

    // Update student name in profile
    if (studentName) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: studentName })
        .eq('id', user.id)
      if (profileError) console.warn('Could not update profile name:', profileError.message)
    }

    // ── Step 1: Drop all existing enrollments for this student ────────────
    // DELETE is now allowed via RLS policy added in migration.
    // This is cleaner than UPDATE-to-dropped because it lets us re-insert fresh.
    const { error: deleteError } = await supabase
      .from('enrollments')
      .delete()
      .eq('student_id', user.id)

    if (deleteError) {
      console.error('Failed to delete old enrollments:', deleteError)
      throw new Error('Could not reset enrollments: ' + deleteError.message)
    }

    console.log('[Save] Cleared old enrollments for', user.id)

    // ── Step 2: Upsert courses and insert fresh enrollments ────────────────
    const savedSubjects = []
    const errors = []

    for (const subject of subjects) {
      if (!subject.code?.trim()) continue

      const code = subject.code.trim().toUpperCase()
      console.log('[Save] Processing subject:', code)

      // Upsert course by code — always update title and schedule
      const { data: courseRows, error: courseError } = await supabase
        .from('courses')
        .upsert(
          {
            code,
            title: subject.description?.trim() || code,
            is_active: true,
            schedule: subject.schedule ?? null,   // always write, even if null
          },
          { onConflict: 'code', ignoreDuplicates: false }
        )
        .select('id')

      console.log('[Save] course upsert result:', courseRows, courseError)

      let courseId
      if (courseError || !courseRows?.length) {
        // Fallback: fetch existing course by code
        const { data: existing, error: fetchErr } = await supabase
          .from('courses')
          .select('id')
          .eq('code', code)
          .maybeSingle()

        if (fetchErr || !existing) {
          console.error('[Save] Cannot find/create course for', code, fetchErr)
          errors.push(code)
          continue
        }
        courseId = existing.id
      } else {
        courseId = courseRows[0].id
      }

      // Insert enrollment (clean insert since we deleted all above)
      const { error: enrollError } = await supabase
        .from('enrollments')
        .insert({ student_id: user.id, course_id: courseId, status: 'active' })

      if (enrollError) {
        console.error('[Save] Enrollment insert error for', code, enrollError)
        errors.push(code)
        continue
      }

      savedSubjects.push({ ...subject, code, courseId })
      console.log('[Save] Saved:', code, '→', courseId)
    }

    console.log(`[Save] Done: ${savedSubjects.length} saved, ${errors.length} failed`, errors)

    if (savedSubjects.length === 0) {
      throw new Error('No subjects could be saved. Check RLS policies or database connection.')
    }

    return { success: true, subjects: savedSubjects }
  } catch (error) {
    console.error('Error saving subjects:', error)
    return { success: false, error: error.message }
  }
}

export async function getStudentEnrollments() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    console.log('[DB] getUser ->', user?.id ?? 'NO USER', userError ?? '')
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

    console.log('[DB] enrollments query error:', error)
    console.log('[DB] enrollments raw data:', JSON.stringify(enrollments, null, 2))

    if (error) throw error

    return { success: true, enrollments: enrollments ?? [] }
  } catch (error) {
    console.error('[DB] getStudentEnrollments threw:', error.message)
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
    console.error('Error fetching messages:', error)
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
    console.error('Error sending message:', error)
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
    return { success: false, error: error.message }
  }
}

export async function markMessageSeen(messageId, userId) {
  try {
    await supabase
      .from('gc_message_seen')
      .upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id', ignoreDuplicates: true })
    return { success: true }
  } catch (error) {
    return { success: false }
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
        profiles ( full_name, email )
      `)
      .in('message_id',
        (await supabase.from('gc_messages').select('id').eq('course_id', courseId)).data?.map(m => m.id) ?? []
      )
    if (error) throw error
    return { success: true, receipts: data }
  } catch (error) {
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
      { event: 'INSERT', schema: 'public', table: 'gc_message_seen' },
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
    console.error('getCourseMembers error:', error)
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
