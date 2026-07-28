# Student Communication Guide - Implementation

This document describes the student-side communication features implemented in the NBSC Student Portal, based on the communication system requirements.

---

## Overview

The student communication system enables seamless interaction between instructors and students within course sections. Each course section has its own dedicated group chat that students can access through multiple views.

---

## Implemented Features

### 1. **Dashboard View**

The Dashboard provides a summary of the student's enrolled courses and recent activity:

- **Welcome message**: Shows enrollment count (e.g., "You're enrolled in 5 subjects")
- **Recent Activity**: Displays the 3 most recent messages across all courses with:
  - Course code
  - Relative time (e.g., "5m ago", "2h ago")
  - Sender name with instructor badge if applicable
  - Message content preview
  - Click to navigate to the course chat

**Navigation**: Home → Dashboard tab

---

### 2. **My Subjects View**

Lists all enrolled subjects with their group chat status:

- **Subject cards** display:
  - Course code (e.g., "IT101")
  - Course title/description
  - Status indicator ("Active")
  - "Enter" button to access the chat

**Navigation**: Home → My Subjects tab

---

### 3. **Group Chats View**

Dedicated view for all active conversations, sorted by most recent activity:

- **Sorted by activity**: Chats with recent messages appear first
- **Message preview**: Shows the most recent message content (truncated to 50 chars)
- **Relative timestamp**: Shows when the last message was sent
- **Quick access**: Click any chat to enter the conversation

**Navigation**: Home → Group Chats tab

---

### 4. **Thread View (ClassRoom)**

The main chat interface for course-specific conversations:

#### **Left Panel - Schedule & Members**
- **Schedule information**: Days, time, room, instructor name
- **Members list**: Shows all enrolled students with:
  - Avatar (initials or image)
  - Full name
  - "(You)" indicator for current user
  - Click to view member profile modal

 #### **Center Panel - Chat**
- **Pinned Messages Section**: Displays instructor-pinned messages at the top with:
  - Yellow background highlighting
  - Sender name
  - Message content
  - Separate styling for own messages

- **Message Display**:
  - **Instructor messages**: Special yellow background with orange left border
  - **Student messages**: Gray background (others) or blue (own)
  - **Sender identification**: Name displayed with "(Instructor)" suffix for instructors
  - **Timestamps**: Time sent on each message
  - **Edited indicator**: Shows "Edited" for modified messages
  - **Reply threading**: Reply preview with original message context
  - **Seen receipts**: Shows who has read the message (for own messages)

- **Message Actions** (via context menu):
  - **Reply**: Reply to any message
  - **Edit**: Edit own messages
  - **Pin/Unpin**: Pin messages (instructor-only feature)
  - **Unsend**: Delete own messages

- **Input Area**:
  - Text input for sending messages
  - Reply bar showing who you're replying to
  - Send button

#### **Right Panel - Netiquette**
- **Guidelines**: 8 netiquette rules for respectful communication
- **Toggle button**: Mobile-friendly inline view

---

## Database Schema Updates

### gc_messages Table

Added `is_pinned` field to support message pinning:

```sql
CREATE TABLE IF NOT EXISTS public.gc_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE NOT NULL,  -- NEW FIELD
    reply_to UUID REFERENCES public.gc_messages(id) ON DELETE SET NULL
);
```

---

## API Functions

### New Functions in `databaseService.js`

#### `getRecentMessages(courseIds)`
Fetches the most recent message for each course for dashboard preview.

**Returns**: `{ success, messages: [{ id, content, created_at, course_id, sender_id, profiles, courses }] }`

#### `pinMessage(messageId)`
Pins a message (instructor-only).

**Returns**: `{ success, error? }`

#### `unpinMessage(messageId)`
Unpins a message (instructor-only).

**Returns**: `{ success, error? }`

#### Updated `getMessages(courseId)`
Now includes `is_pinned` and `role` fields in the query.

---

## UI Components

### State Management

**Home Component**:
- `subView`: Controls which tab is active ('dashboard', 'subjects', 'chats')
- `recentMessages`: Stores recent messages for dashboard preview
- `subjects`: Stores enrolled courses with chat info

**ThreadView Component**:
- `messages`: All messages in the chat
- `replyTo`: Current reply target
- `editingId`: Message being edited
- `menuMsgId`: Message with open context menu
- `seenMap`: Read receipts tracking
- `members`: Enrolled students list

---

## Styling

### New CSS Classes

**Dashboard & Views**:
- `.home__chats-tabs`: Tab navigation container
- `.home__chats-tab`: Individual tab button
- `.home__chats-tab--active`: Active tab styling
- `.home__dashboard`: Dashboard view container
- `.home__recent-section`: Recent activity section
- `.home__recent-card`: Recent message card
- `.home__recent-badge`: Instructor badge
- `.home__gc-preview`: Message preview in chat list
- `.home__gc-time`: Timestamp in chat list
- `.home__gc-status`: Enrollment status indicator
- `.home__gc-action`: Enter button styling

**Pinned Messages**:
- `.home__pinned-section`: Pinned messages container
- `.home__pinned-header`: Section header
- `.home__pinned-message`: Individual pinned message
- `.home__pinned-message--me`: Own pinned message styling
- `.home__pinned-sender`: Sender name
- `.home__pinned-content`: Message content

**Instructor Messages**:
- `.home__msg--instructor`: Instructor message styling
- Yellow background with orange left border
- Special styling for own instructor messages

---

## Real-time Features

### Supabase Realtime Subscriptions

The chat uses real-time subscriptions for:

1. **New Messages**: Instant delivery of new messages
2. **Message Updates**: Real-time edits and deletions
3. **Seen Receipts**: Live read status updates
4. **Member Changes**: Enrollment changes (students joining/leaving)

---

## Role-Based Features

### Instructor-Only Features
- **Pin/Unpin Messages**: Mark important messages as pinned
- **Pinned messages appear at top** of chat for all participants

### Student Features
- **View pinned messages**: See instructor-pinned announcements
- **Send messages**: Text-only messaging
- **Edit own messages**: Within the chat
- **Unsend own messages**: Delete own messages
- **Reply to messages**: Threaded replies
- **View member profiles**: Click on member names to see profiles

---

## Communication Best Practices

### For Students

1. **Keep messages relevant**: Post content related to the course material, assignments, or class logistics
2. **Be respectful**: Maintain professional communication with instructors and classmates
3. **Use pinned messages**: Check pinned messages first for important announcements
4. **Share resources appropriately**: Use link sharing for external resources
5. **Avoid spam**: Don't flood the chat with unrelated content

---

## Technical Implementation Notes

### Message Flow

1. **Student sends message** → Inserted into `gc_messages` table
2. **Real-time subscription** → All participants receive the message instantly
3. **Seen receipt** → Other students mark as seen via `gc_message_seen` table
4. **Instructor pins** → `is_pinned` set to `true`, appears in pinned section

### Access Control

**Row Level Security (RLS)** ensures:
- Students can only access chats for courses they're enrolled in
- Message visibility is properly scoped by user role
- Pin/unpin operations are restricted to instructors (enforced in UI)

---

## Future Enhancements

### Planned Features

1. **Message editing time window**: Allow edits within 5 minutes of sending
2. **Message reactions**: Add emoji reactions to messages
3. **In-chat search**: Search through message history by keyword
4. **Unread badges**: Display unread message counts with accurate tracking
5. **File attachments**: Support for document sharing (with size limits)
6. **Anonymous questions**: Optional mode for students to ask questions without revealing identity

---

## Integration with Instructor UI

The student interface shares:
- **Same database schema**: `gc_messages`, `group_chats`, `profiles`
- **Same message structure**: Identical data model
- **Same real-time patterns**: Supabase Realtime subscriptions
- **Same RLS policies**: Consistent access control

### Design Consistency

Both interfaces use:
- **Shared CSS custom properties** for consistent theming
- **Same message bubble styling** (with role-specific variants)
- **Similar navigation patterns** (Dashboard, Subjects, Chats)
- **Consistent visual language** across components

---

## Summary

The student communication system is fully implemented with:
- ✅ Dashboard view with recent activity
- ✅ My Subjects view with enrollment status
- ✅ Group Chats view sorted by activity
- ✅ Thread view with full chat functionality
- ✅ Pinned messages display (instructor feature)
- ✅ Instructor role detection and styling
- ✅ Real-time message delivery
- ✅ Message editing and unsending
- ✅ Reply threading
- ✅ Seen receipts
- ✅ Member profiles
- ✅ Netiquette guidelines

The implementation follows the communication guide requirements and provides a symmetrical experience with the instructor interface, with role-specific features where appropriate.
