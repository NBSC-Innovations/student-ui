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

    // ── Step 1: Drop all existing active enrollments for this student ──────
    // This ensures re-uploading replaces GC membership entirely
    const { error: deleteError } = await supabase
      .from('enrollments')
      .delete()
      .eq('student_id', user.id)
      .eq('status', 'active')

    if (deleteError) {
      console.error('Failed to clear old enrollments:', deleteError)
      throw new Error('Could not reset enrollments: ' + deleteError.message)
    }

    // ── Step 2: Upsert courses and create fresh enrollments ────────────────
    const savedSubjects = []

    for (const subject of subjects) {
      if (!subject.code) continue

      // Upsert course by code
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .upsert(
          { code: subject.code.toUpperCase(), title: subject.description || subject.code, is_active: true },
          { onConflict: 'code', ignoreDuplicates: false }
        )
        .select('id')
        .single()

      let courseId
      if (courseError) {
        // Fallback: fetch existing course
        const { data: existing } = await supabase
          .from('courses')
          .select('id')
          .eq('code', subject.code.toUpperCase())
          .single()
        if (!existing) { console.error('Course not found for', subject.code); continue }
        courseId = existing.id
      } else {
        courseId = course.id
      }

      // Insert fresh enrollment
      const { error: enrollError } = await supabase
        .from('enrollments')
        .insert({ student_id: user.id, course_id: courseId, status: 'active' })

      if (enrollError) {
        console.error('Enrollment error for', subject.code, enrollError)
        continue
      }

      savedSubjects.push({ ...subject, courseId })
    }

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
    if (userError) throw userError
    if (!user) throw new Error('User not authenticated')

    const { data: enrollments, error } = await supabase
      .from('enrollments')
      .select(`
        *,
        courses (
          id,
          code,
          title,
          description
        )
      `)
      .eq('student_id', user.id)
      .eq('status', 'active')

    if (error) throw error

    return { success: true, enrollments }
  } catch (error) {
    console.error('Error fetching enrollments:', error)
    return { success: false, error: error.message }
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
        sender_id,
        profiles (
          full_name,
          email
        )
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

export async function sendMessage(courseId, content) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('gc_messages')
      .insert({ course_id: courseId, sender_id: user.id, content })
      .select()
      .single()

    if (error) throw error
    return { success: true, message: data }
  } catch (error) {
    console.error('Error sending message:', error)
    return { success: false, error: error.message }
  }
}

export function subscribeToMessages(courseId, onMessage) {
  return supabase
    .channel(`gc_messages:${courseId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'gc_messages', filter: `course_id=eq.${courseId}` },
      (payload) => onMessage(payload.new)
    )
    .subscribe()
}
