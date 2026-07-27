import { supabase } from './supabaseClient'

export async function saveStudentSubjects(studentName, subjects) {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('User not authenticated')

    // Update student name in profile (ignore error if profile doesn't exist yet)
    if (studentName) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: studentName })
        .eq('id', user.id)

      if (profileError) {
        console.warn('Could not update profile name:', profileError.message)
      }
    }

    const savedSubjects = []

    for (const subject of subjects) {
      if (!subject.code) continue

      // Upsert course — insert if not exists, do nothing if code already exists
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .upsert(
          { code: subject.code.toUpperCase(), title: subject.description || subject.code, is_active: true },
          { onConflict: 'code', ignoreDuplicates: false }
        )
        .select('id')
        .single()

      if (courseError) {
        console.error('Course upsert error for', subject.code, courseError)
        // Try to fetch existing course if upsert failed
        const { data: existing } = await supabase
          .from('courses')
          .select('id')
          .eq('code', subject.code.toUpperCase())
          .single()
        if (!existing) continue
        subject._courseId = existing.id
      } else {
        subject._courseId = course.id
      }

      // Upsert enrollment — insert if not exists, skip if already enrolled
      const { error: enrollError } = await supabase
        .from('enrollments')
        .upsert(
          { student_id: user.id, course_id: subject._courseId, status: 'active' },
          { onConflict: 'student_id,course_id', ignoreDuplicates: true }
        )

      if (enrollError) {
        console.error('Enrollment error for', subject.code, enrollError)
        continue
      }

      savedSubjects.push({ ...subject, courseId: subject._courseId })
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
