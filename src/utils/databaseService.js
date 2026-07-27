import { supabase } from './supabaseClient'

export async function saveStudentSubjects(studentName, subjects) {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('User not authenticated')

    // Update student name in profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: studentName })
      .eq('id', user.id)

    if (profileError) throw profileError

    // For each subject, check if course exists, create if not
    const savedSubjects = []
    for (const subject of subjects) {
      // Check if course already exists
      const { data: existingCourse } = await supabase
        .from('courses')
        .select('id')
        .eq('code', subject.code)
        .single()

      let courseId
      if (existingCourse) {
        courseId = existingCourse.id
      } else {
        // Create new course
        const { data: newCourse, error: courseError } = await supabase
          .from('courses')
          .insert({
            code: subject.code,
            title: subject.description,
            is_active: true
          })
          .select()
          .single()

        if (courseError) throw courseError
        courseId = newCourse.id
      }

      // Check if enrollment exists
      const { data: existingEnrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('student_id', user.id)
        .eq('course_id', courseId)
        .single()

      if (!existingEnrollment) {
        // Create enrollment
        const { error: enrollmentError } = await supabase
          .from('enrollments')
          .insert({
            student_id: user.id,
            course_id: courseId,
            status: 'active'
          })

        if (enrollmentError) throw enrollmentError
      }

      savedSubjects.push({
        ...subject,
        courseId
      })
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
