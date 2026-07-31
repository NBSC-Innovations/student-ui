# Instructor Guide - Section & Group Chat Management

## Overview

This guide explains how the section-based group chat system works for instructors. When you create a section, the system automatically creates a course and group chat. Students can then join by scanning their COR (Certificate of Registration) or manually entering the section code.

## How It Works

### 1. Creating a Section

When you create a section, the following happens automatically:

1. **Section is created** with your specified code (e.g., "ICS73") and description
2. **Course is auto-created** with the same code and description
3. **Group chat is auto-created** linked to the course
4. **You are automatically added** to the group chat

### 2. Student Enrollment Flow

Students can join your section in two ways:

#### Option A: OCR Scan (Automatic)
- Student uploads their Certificate of Registration (COR)
- OCR extracts their name and enrolled sections
- System automatically enrolls them in matching courses
- Trigger adds them to the group chat

#### Option B: Manual Section Code
- Student manually enters the section code (e.g., "ICS73")
- Input automatically converts to uppercase
- System finds the section by code
- Student is enrolled in the linked course (or section if no course is linked)
- Trigger adds them to the group chat

### 3. Automatic Sync Flow

```
Instructor creates section
    ↓
Trigger creates course (same code/description)
    ↓
Trigger creates group chat (linked to course)
    ↓
Instructor auto-added to group chat
    ↓
Student joins (OCR or manual code)
    ↓
Student enrolled in course (status='active')
    ↓
Trigger adds student to group chat
    ↓
Both can now communicate
```

## Database Schema

### Key Tables

- **sections**: Instructor-created sections with code and description
- **courses**: Auto-created from sections with same code/description
- **group_chats**: One per course, named "Section Code - Description"
- **enrollments**: Student enrollments in courses
- **group_chat_members**: Chat membership (auto-populated by triggers)

### Triggers

1. **`create_course_and_group_chat_on_section`**
   - Runs when a section is inserted
   - Creates course and group chat
   - Adds instructor to group chat

2. **`add_student_to_chat_on_enrollment`**
   - Runs when enrollment is inserted/updated with status='active'
   - Adds student to the group chat
   - Only if group chat exists for the course

## Instructor Actions

### Create a Section

```sql
INSERT INTO public.sections (name, description, instructor_id, schedule, room)
VALUES (
  'ICS73',
  'System Integration and Architecture',
  'your-instructor-id',
  '{"days": ["M", "W", "F"], "time": "08:00-09:00"}',
  'Room 101'
);
```

This automatically:
- Creates course with code="ICS73" and title="System Integration and Architecture"
- Creates group chat named "ICS73 - System Integration and Architecture"
- Adds you to the group chat

### View Your Sections

```sql
SELECT s.*, c.code, c.title 
FROM public.sections s
JOIN public.courses c ON s.course_id = c.id
WHERE s.instructor_id = auth.uid();
```

### View Students in Your Group Chats

```sql
SELECT 
  gc.name as group_chat_name,
  p.full_name,
  p.email,
  p.student_id,
  gcm.joined_at
FROM public.group_chat_members gcm
JOIN public.group_chats gc ON gcm.group_chat_id = gc.id
JOIN public.courses c ON gc.course_id = c.id
JOIN public.sections s ON c.id = s.course_id
JOIN public.profiles p ON gcm.user_id = p.id
WHERE s.instructor_id = auth.uid()
ORDER BY gc.name, p.full_name;
```

## Student Experience

### OCR Flow
1. Student uploads COR image
2. Backend OCR extracts: name, section codes, subjects
3. Frontend displays extracted data for review
4. Student confirms enrollment
5. System enrolls student in courses
6. Triggers add student to group chats

### Manual Code Flow
1. Student enters section code (e.g., "BSIT-3A")
2. Input automatically converts to uppercase
3. System finds section by code
4. Student confirms enrollment
5. System enrolls student in linked course (or section if no course is linked)
6. Trigger adds student to group chat

## Troubleshooting

### Students not appearing in group chat?

1. **Check if enrollment exists:**
   ```sql
   SELECT * FROM public.enrollments 
   WHERE course_id = 'your-course-id' 
   AND student_id = 'student-id';
   ```

2. **Check enrollment status:**
   ```sql
   SELECT * FROM public.enrollments 
   WHERE course_id = 'your-course-id' 
   AND status = 'active';
   ```

3. **Check if group chat exists:**
   ```sql
   SELECT * FROM public.group_chats 
   WHERE course_id = 'your-course-id';
   ```

4. **Check if student is in group chat:**
   ```sql
   SELECT * FROM public.group_chat_members 
   WHERE group_chat_id = (SELECT id FROM public.group_chats WHERE course_id = 'your-course-id')
   AND user_id = 'student-id';
   ```

### Group chat not created?

1. **Check if section was created:**
   ```sql
   SELECT * FROM public.sections WHERE id = 'section-id';
   ```

2. **Check if course was created:**
   ```sql
   SELECT * FROM public.courses WHERE id IN (
     SELECT course_id FROM public.sections WHERE id = 'section-id'
   );
   ```

3. **Check trigger function:**
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'create_course_and_group_chat_on_section';
   ```

## Security

### Row Level Security (RLS)

- **Instructors** can only view their own sections and courses
- **Students** can only view courses they're enrolled in
- **Group chats** are only visible to members
- **Messages** are only visible to chat members

### RLS Policies

- Instructors can create/update/delete their sections
- Authenticated users can create enrollments
- Service role can bypass RLS for trigger operations

## Best Practices

1. **Use clear section codes** (e.g., "BSIT-3A" instead of "Section 1")
2. **Provide descriptive section descriptions** (e.g., subject name)
3. **Include schedule information** in JSON format
4. **Inform students** of their section codes for manual enrollment
5. **Monitor enrollments** to ensure students are joining correctly

## API Integration

### Frontend Functions

The following functions are available in `databaseService.js`:

- `findSectionByCode(sectionCode)` - Find section by code
- `enrollInSection(sectionId, courseId)` - Enroll student in section
- `getStudentEnrollments()` - Get student's enrollments
- `getCourseMembers(courseId)` - Get members of a course's group chat

### Backend OCR Endpoint

```
POST /api/scan-cor
Content-Type: multipart/form-data

Body: file (COR image)

Response:
{
  "name": "Student Full Name",
  "subjects": [
    {
      "code": "ICS73",
      "description": "System Integration and Architecture"
    }
  ],
  "image_preview": "base64_encoded_image"
}
```

## System Administration

### Initial Setup

To set up the system for the first time, run these SQL files in Supabase SQL Editor in order:

1. **`database-schema.sql`** - Creates all tables, triggers, and RLS policies
2. **`add-avatar-url-column.sql`** - Adds avatar_url column to profiles table
3. **`create-gc-messages-table.sql`** - Creates the unified message table
4. **`create-message-functions.sql`** - Creates RPC functions for messaging
5. **`setup-gc-messages-rls.sql`** - Sets up RLS policies for messages
6. **`fix-profiles-rls.sql`** - Allows viewing profiles of course members

### Creating Instructor Accounts

```sql
-- Create an instructor profile
INSERT INTO public.profiles (id, email, full_name, role, student_id)
VALUES (
  'instructor-uuid',
  'instructor@nbsc.edu.ph',
  'Instructor Name',
  'instructor',
  NULL
);
```

### Creating Sections for Instructors

```sql
-- Create a section linked to an instructor
INSERT INTO public.sections (name, description, instructor_id, schedule, room)
VALUES (
  'ICS73',
  'System Integration and Architecture',
  'instructor-uuid',
  '{"days": ["M", "W", "F"], "time": "08:00-09:00"}',
  'Room 101'
);
```

### Database Maintenance

#### Check System Health

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check triggers are active
SELECT tgname, tgenabled FROM pg_trigger 
WHERE tgname LIKE '%section%' OR tgname LIKE '%enrollment%';

-- Check RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('profiles', 'courses', 'sections', 'group_chats', 'messages', 'gc_messages')
ORDER BY tablename, policyname;
```

#### Monitor Enrollments

```sql
-- View all active enrollments
SELECT 
  e.id,
  p.full_name as student_name,
  c.code as course_code,
  c.title as course_title,
  e.status,
  e.created_at
FROM public.enrollments e
JOIN public.profiles p ON e.student_id = p.id
JOIN public.courses c ON e.course_id = c.id
ORDER BY e.created_at DESC;

-- View enrollment statistics
SELECT 
  c.code,
  c.title,
  COUNT(e.id) as student_count
FROM public.courses c
LEFT JOIN public.enrollments e ON c.id = e.course_id AND e.status = 'active'
GROUP BY c.id, c.code, c.title
ORDER BY student_count DESC;
```

#### Monitor Group Chat Activity

```sql
-- View group chat member counts
SELECT 
  gc.name as chat_name,
  c.code as course_code,
  COUNT(gcm.user_id) as member_count
FROM public.group_chats gc
JOIN public.courses c ON gc.course_id = c.id
LEFT JOIN public.group_chat_members gcm ON gc.id = gcm.group_chat_id
GROUP BY gc.id, gc.name, c.code
ORDER BY member_count DESC;

-- View recent messages
SELECT 
  gcm.content,
  p.full_name as sender_name,
  c.code as course_code,
  gcm.created_at
FROM public.gc_messages gcm
JOIN public.profiles p ON gcm.sender_id = p.id
JOIN public.courses c ON gcm.course_id = c.id
WHERE gcm.is_deleted = false
ORDER BY gcm.created_at DESC
LIMIT 50;
```

### Troubleshooting System Issues

#### Students Cannot View Instructor Profiles

**Symptom:** 406 errors when fetching instructor profiles

**Solution:** Ensure the RLS policy for viewing course member profiles is active:
```sql
-- Check if the policy exists
SELECT * FROM pg_policies 
WHERE tablename = 'profiles' 
AND policyname = 'Users can view profiles of course members';

-- If missing, run fix-profiles-rls.sql
```

#### Messages Not Syncing Between Instructor and Student

**Symptom:** Instructor sends messages but student cannot see them

**Solution:** Ensure both systems use the unified `gc_messages` table:
```sql
-- Check if gc_messages table exists
SELECT * FROM information_schema.tables 
WHERE table_name = 'gc_messages' AND table_schema = 'public';

-- Check if RPC functions exist
SELECT * FROM pg_proc 
WHERE proname IN ('insert_message', 'fetch_course_messages');

-- If missing, run create-gc-messages-table.sql and create-message-functions.sql
```

#### Group Chat Members Not Auto-Added

**Symptom:** Students enrolled but not in group chat

**Solution:** Check trigger function and enrollment status:
```sql
-- Check enrollment status
SELECT * FROM public.enrollments 
WHERE student_id = 'student-id' AND status = 'active';

-- Manually add student to group chat if trigger failed
INSERT INTO public.group_chat_members (group_chat_id, user_id)
SELECT gc.id, 'student-id'
FROM public.group_chats gc
JOIN public.courses c ON gc.course_id = c.id
JOIN public.enrollments e ON c.id = e.course_id
WHERE e.student_id = 'student-id' AND e.status = 'active'
ON CONFLICT (group_chat_id, user_id) DO NOTHING;
```

### SQL Scripts Reference

| Script | Purpose |
|--------|---------|
| `database-schema.sql` | Initial database setup |
| `add-avatar-url-column.sql` | Add avatar_url column to profiles |
| `create-gc-messages-table.sql` | Create unified message table |
| `create-message-functions.sql` | Create message RPC functions |
| `setup-gc-messages-rls.sql` | Set up message RLS policies |
| `fix-profiles-rls.sql` | Allow viewing course member profiles |
| `drop-gc-message-seen.sql` | Remove problematic message seen table |
| `enroll-student.sql` | Enroll specific student in courses |
| `diagnose-profiles.sql` | Diagnose profile-related issues |

### Security Considerations

- **Never share service role keys** - These bypass all RLS policies
- **Use service role only for admin operations** - Regular operations should use authenticated user context
- **Monitor RLS policies** - Ensure they allow appropriate access without over-permissioning
- **Regular backups** - Export database schema and data regularly
- **Audit logs** - Monitor enrollment and message activity for suspicious patterns

## Authentication & Validation

### Email Validation

The system enforces strict email validation for student accounts:

- **Domain Restriction**: Only `@nbsc.edu.ph` email addresses are allowed
- **Numeric Requirement**: Email local part must be numeric (e.g., `2023001234@nbsc.edu.ph`)
- **Real-time Validation**: Email validation occurs as user types and clears error when valid domain is entered
- **Error Messages**: Clear error messages guide users to correct format

### Password Requirements

- **Minimum Length**: Passwords must be at least 8 characters
- **Password Visibility**: Users can toggle password visibility with eye icon
- **Password Reset**: Forgot password flow sends reset link to registered email

### Authentication Methods

The system supports multiple authentication methods:

1. **Google OAuth Sign-in**
   - One-click authentication with Google account
   - Automatic profile creation from Google metadata
   - Avatar sync from Google profile picture

2. **Email/Password Sign-in**
   - Traditional email and password authentication
   - Email confirmation required before account activation
   - Session management with automatic redirects

3. **Account Linking**
   - Users can link Google account to existing password account
   - Users can add password to existing Google account
   - Flexible sign-in options after linking

### Sign-up Flow

1. User enters email (validated for @nbsc.edu.ph domain and numeric format)
2. User creates password (minimum 8 characters)
3. System sends confirmation email
4. User clicks confirmation link to activate account
5. Profile automatically created by database trigger
6. User redirected to student portal

### Error Handling

The login system provides comprehensive error handling:

- **Invalid Credentials**: Clear message when email/password don't match
- **Google Account Detection**: Informs users if they need to use Google sign-in
- **Email Confirmation**: Reminds users to check inbox for confirmation link
- **Account Exists**: Guides users to sign in if account already exists
- **Network Errors**: Graceful handling of connection issues

### Security Features

- **Email Verification**: Required before account activation
- **Session Management**: Automatic session handling with Supabase auth
- **Password Reset**: Secure password reset via email link
- **Account Recovery**: Forgot password flow for account recovery
- **Profile Auto-creation**: Database trigger creates profile on signup

## Recent UI/UX Improvements

### Mobile Responsiveness Enhancements

The student interface has been enhanced for better mobile experience:

- **Mobile Modals for Schedule & Netiquette**: On small screens (≤768px), clicking "Schedule & Members" or "Netiquette" now opens a modal overlay instead of a side panel, matching the behavior of the "Leave Group Chat" modal
- **Fixed Menu Visibility**: Thread menu dropdown z-index increased to ensure it appears above all other elements on mobile screens
- **Responsive Layout**: Group chat interface adapts seamlessly between desktop (side panels) and mobile (modal overlays)

### Section Code Input Improvements

- **Auto-Uppercase Conversion**: All section code input fields now automatically convert to uppercase as the user types, ensuring consistent formatting
- **Flexible Section Joining**: Students can now join sections even if they have no linked course, allowing group chats to function independently of course assignments

### Profile Page Fixes

- **Enrolled Subjects Display**: Fixed data access paths to correctly display enrolled subjects using the proper nested structure (`sections.courses` instead of direct `courses` access)

### Student Experience Updates

The student enrollment flow now includes:

1. **Uppercase Input**: Section code input automatically converts to uppercase
2. **Flexible Joining**: Can join sections with or without linked courses
3. **Mobile-Friendly**: Schedule, netiquette, and leave options display as modals on mobile
4. **Proper Data Display**: Enrolled subjects show correct course information in profile

## Summary

The instructor workflow is designed to be simple:

1. **Create sections** with clear codes and descriptions
2. **System auto-creates** courses and group chats
3. **Students join** via OCR or manual code
4. **System auto-adds** students to group chats
5. **Everyone communicates** in the section's group chat

No manual management of group chat memberships is required - it's all handled automatically by database triggers.

For system administrators, ensure all SQL setup scripts are run in order and monitor the database health using the provided diagnostic queries.

## Mobile & Responsive Features

The application includes comprehensive mobile support:

- **Responsive Design**: Adapts layout based on screen size
- **Touch-Friendly**: Large tap targets and intuitive gestures
- **Modal Overlays**: Critical information displayed in modals on small screens
- **Auto-Formatting**: Inputs automatically format for consistency (e.g., uppercase codes)
