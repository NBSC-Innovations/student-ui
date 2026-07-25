// src/utils/corParser.js
//
// Best-effort parser that turns raw OCR text from a COR into structured subject rows.
// COR formats vary a lot — treat this as a starting point. Test it against real NBSC
// COR samples early and tighten these regex patterns based on what you actually see.

// Matches subject codes like "IT101", "CS 201", "GE-1", "PATHFIT2"
const SUBJECT_CODE_PATTERN = /\b([A-Z]{2,8}[\s-]?\d{1,4}[A-Z]?)\b/

// Matches section labels like "BSIT-3A", "BSCS3B", "3A"
const SECTION_PATTERN = /\b([A-Z]{2,6}-?\d[A-Z]?)\b/

// Matches a time range like "8:00-9:00" or "08:00 AM-09:30 AM", used to trim
// descriptions that run into schedule columns on the same line.
const TIME_PATTERN = /\d{1,2}:\d{2}\s*(AM|PM)?/i

export function parseCorText(rawText) {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const subjects = []

  lines.forEach((line, index) => {
    const codeMatch = line.match(SUBJECT_CODE_PATTERN)
    if (!codeMatch) return

    const code = codeMatch[1].replace(/\s+/g, '').toUpperCase()

    // Everything after the code on the same line, minus anything from the first
    // time stamp onward (schedule columns), collapsed whitespace.
    const afterCode = line.slice(codeMatch.index + codeMatch[0].length)
    const beforeTime = afterCode.split(TIME_PATTERN)[0]
    const description = beforeTime.replace(/\s{2,}/g, ' ').trim() || 'Untitled Subject'

    const sectionMatch = line.match(SECTION_PATTERN)
    const section = sectionMatch ? sectionMatch[1].toUpperCase() : ''

    subjects.push({
      id: `${code}-${index}`,
      code,
      description,
      section,
      rawLine: line, // kept for debugging misreads
    })
  })

  return subjects
}