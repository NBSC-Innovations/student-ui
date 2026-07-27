import base64
import re
import cv2
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import pandas as pd
from PIL import Image, ImageOps
import pytesseract

TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

MIN_CONFIDENCE_NAME = 60
MIN_CONFIDENCE_SUBJECT = 55

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def load_image_from_bytes(file_bytes):
  try:
    pil_img = Image.open(file_bytes)
    pil_img = ImageOps.exif_transpose(pil_img)
    open_cv_image = np.array(pil_img)
    if len(open_cv_image.shape) == 3:
      if open_cv_image.shape[2] == 4:
        image = cv2.cvtColor(open_cv_image, cv2.COLOR_RGBA2BGR)
      elif open_cv_image.shape[2] == 3:
        image = cv2.cvtColor(open_cv_image, cv2.COLOR_RGB2BGR)
      else:
        image = open_cv_image
    else:
      image = open_cv_image
  except Exception:
    nparr = np.frombuffer(file_bytes.read(), np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

  if image is None:
    raise ValueError('Could not process image file.')

  try:
    osd = pytesseract.image_to_osd(image)
    angle_match = re.search(r'Rotate:\s+(\d+)', osd)
    if angle_match:
      angle = int(angle_match.group(1))
      if angle == 90:
        image = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
      elif angle == 180:
        image = cv2.rotate(image, cv2.ROTATE_180)
      elif angle == 270:
        image = cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
  except Exception:
    pass

  return image


def get_ocr_dataframe_from_cv2(image):
  gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
  h, w = gray.shape[:2]

  # Upscale image if necessary for sharper OCR resolution
  target_w = max(w * 2, 1600)
  scale = target_w / w
  resized = cv2.resize(
      gray, (target_w, int(h * scale)), interpolation=cv2.INTER_CUBIC
  )

  data = pytesseract.image_to_data(
      resized, output_type=pytesseract.Output.DATAFRAME, config='--oem 1 --psm 6'
  )
  data = data.dropna(subset=['text'])
  data['text'] = data['text'].astype(str).str.strip()
  data = data[data['text'] != '']

  for col in ['left', 'top', 'width', 'height', 'conf']:
    data[col] = pd.to_numeric(data[col], errors='coerce')

  return data


def group_text_into_lines(df, y_tolerance=14):
  if df.empty:
    return []

  df_sorted = df.sort_values(by='top').copy()
  lines = []

  for _, row in df_sorted.iterrows():
    placed = False
    for line in lines:
      avg_y = sum(w['top'] for w in line) / len(line)
      if abs(row['top'] - avg_y) <= y_tolerance:
        line.append(row.to_dict())
        placed = True
        break
    if not placed:
      lines.append([row.to_dict()])

  for i in range(len(lines)):
    lines[i] = sorted(lines[i], key=lambda w: w['left'])

  lines = sorted(lines, key=lambda l: sum(w['top'] for w in l) / len(l))
  return lines


def extract_student_name(lines):
  name = ''
  name_conf = 0.0

  for line in lines:
    line_text = ' '.join([w['text'] for w in line])

    if 'name' in line_text.lower() and not name:
      name_words = []
      confs = []
      found_label = False

      for w in line:
        if 'name' in w['text'].lower():
          found_label = True
          continue
        if found_label:
          if w['text'].lower() in [':', 'student', 'section', 'course', 'id']:
            continue
          name_words.append(w['text'])
          if w['conf'] > 0:
            confs.append(w['conf'])

      if name_words:
        name = ' '.join(name_words)
        name = re.sub(r'[^A-Za-z,\s\.]', '', name).strip()
        name = re.sub(r'\s+', ' ', name)
        name_conf = sum(confs) / len(confs) if confs else 0.0
        break

  return name, name_conf


def clean_subject_description(text):
  if not text:
    return ''

  # 1. Common word-level OCR typo replacements (kept minimal and exact)
  ocr_typo_fixes = {
      r'\bRetum\b': 'Return',
      r'\bEthic\b': 'Ethics',
  }
  for pattern, replacement in ocr_typo_fixes.items():
    text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

  # 2. Clean trailing noise characters (e.g. ':', '-', '|', '.')
  text = re.sub(r'[:\-\|\.]+$', '', text).strip()

  # 3. Dynamic ampersand fix: removes stray 'e' or 'ee' right before/after '&'
  text = re.sub(r'\b[eE]+\s*&', '&', text)
  text = re.sub(r'&\s*[eE]+\b', '&', text)

  # 4. Strip stray single-digit numbers before prepositions
  text = re.sub(
      r'\s+[1-9]\s+(for|in|of|and|&|to|with)\b',
      r' \1',
      text,
      flags=re.IGNORECASE,
  )

  # 5. Remove isolated single-letter noise in the middle of text
  text = re.sub(r'\s+\b[b-hj-zB-HJ-Z]\b\s+', ' ', text)

  # 6. Fix Roman numerals at the end of titles (e.g. "Project I" -> "Project 1")
  text = re.sub(r'\bI\b$', '1', text)
  text = re.sub(r'\bII\b$', '2', text)
  text = re.sub(r'\bIII\b$', '3', text)

  # 7. Normalize IT acronym capitalization
  text = re.sub(r'\bIt\b', 'IT', text)

  # 8. Collapse spaces
  text = re.sub(r'\s+', ' ', text).strip()

  # 9. Strip leading single-letter artifacts
  text = re.sub(r'^[a-zA-Z]\s+', '', text).strip()

  return text


def extract_table_subjects(lines):
  subjects = []
  code_pattern = re.compile(r'^(IT|ICS|ITE|IBM|IS)\d{2,4}$', re.IGNORECASE)

  # Pattern for day abbreviations: MON, TUE, WED, THU, FRI, SAT, SUN (also M/T/W/TH/F/S)
  day_pattern = re.compile(
      r'\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|M|T|W|TH|F|S)(/?(Mon|Tue|Wed|Thu|Fri|Sat|Sun|M|T|W|TH|F|S))*\b',
      re.IGNORECASE
  )
  # Pattern for time: 7:30, 9:00, 10:30 AM, 1:00 PM etc.
  time_pattern = re.compile(
      r'\b\d{1,2}:\d{2}\s*(?:AM|PM)?\s*[-–]\s*\d{1,2}:\d{2}\s*(?:AM|PM)?\b',
      re.IGNORECASE
  )
  # Pattern for room: alphanumeric room codes like "IT101", "Rm 3", "Lab 2", "Gym", "TBA"
  room_pattern = re.compile(
      r'\b(?:Rm\.?\s*\w+|\w*Lab\w*|\w*Room\w*|Gym|TBA|[A-Z]{1,4}\d{2,4})\b',
      re.IGNORECASE
  )

  def extract_schedule_from_line(line, start_idx):
    """Extract schedule info (days, time, room, instructor) from words after start_idx."""
    words_after = line[start_idx:]
    remaining = ' '.join(w['text'] for w in words_after)

    days = ''
    time = ''
    room = ''
    instructor = ''

    day_match = day_pattern.search(remaining)
    if day_match:
      days = day_match.group(0).strip()

    time_match = time_pattern.search(remaining)
    if time_match:
      time = time_match.group(0).strip()

    room_match = room_pattern.search(remaining)
    if room_match:
      candidate = room_match.group(0).strip()
      if candidate.lower() not in days.lower() and candidate not in time:
        room = candidate

    # ── Instructor extraction ─────────────────────────────────────────────
    # Strategy: find the rightmost cluster of words that look like a person's name.
    # On NBSC COR the instructor column is always the last column on the row.
    # We remove known schedule tokens and look at what's left.

    # Build a clean copy with schedule tokens removed
    noise_re = re.compile(
        r'\b(lec|lab|lecture|laboratory|units?|tba|[0-9]+(?:\.[0-9]+)?)\b'
        r'|' + re.escape(days) +
        r'|' + re.escape(time) +
        r'|' + re.escape(room),
        re.IGNORECASE
    ) if (days or time or room) else re.compile(
        r'\b(lec|lab|lecture|laboratory|units?|tba|[0-9]+(?:\.[0-9]+)?)\b',
        re.IGNORECASE
    )

    leftover = noise_re.sub(' ', remaining)
    # Remove remaining punctuation except dots/commas in names
    leftover = re.sub(r'[^A-Za-z\s\.\,]', ' ', leftover)
    leftover = re.sub(r'\s+', ' ', leftover).strip()

    if not leftover:
      if days or time:
        return {'days': days, 'time': time, 'room': room, 'instructor': ''}
      return None

    # Match Filipino-style names: all-caps words OR Title-case words, 2-5 tokens
    # Handles: "DELA CRUZ MARIA A", "Reyes John", "DE LA PENA"
    name_re = re.compile(
        r'\b(?:[A-Z]{2,}|[A-Z][a-z]+)(?:\s+(?:[A-Z]{2,}|[A-Z][a-z]+)){1,5}\b'
    )
    # Find ALL matches and take the longest one (most likely the full name)
    matches = name_re.findall(leftover)
    ignore_words = {
        'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
        'TBA', 'Lab', 'Gym', 'Room', 'Lec', 'Laboratory',
        'Lecture', 'Units', 'Unit',
    }
    candidates = [m.strip() for m in matches if len(m.strip()) >= 5 and m.strip() not in ignore_words]
    if candidates:
      # Prefer the rightmost / longest candidate (instructor is last column)
      instructor = max(candidates, key=lambda c: (len(c), leftover.rfind(c)))

    if days or time:
      return {'days': days, 'time': time, 'room': room, 'instructor': instructor}
    return None

  for line in lines:
    for i, w in enumerate(line):
      raw_text = w['text'].upper()
      if raw_text.startswith(('IT', 'ICS', 'ITE', 'IBM', 'IS')):
        prefix = raw_text[:2] if raw_text.startswith('IT') else raw_text[:3]
        digits = raw_text[len(prefix):].replace('O', '0')
        raw_text = prefix + digits

      if code_pattern.match(raw_text):
        code = raw_text
        desc_words = []
        confs = []
        schedule_start_idx = None

        stop_keywords = {'units', 'unit', 'lecture', 'laboratory', 'instructor', 'room', 'tba'}

        for j, next_w in enumerate(line[i + 1:], start=i + 1):
          txt = next_w['text']
          clean_txt = txt.lower().replace('(', '').replace(')', '').strip()

          # Stop at explicit stop keywords — schedule starts here
          if clean_txt in stop_keywords or 'room' in clean_txt:
            schedule_start_idx = j
            break

          # Stop at day+time pattern — schedule starts here
          if re.match(r'^(mon|tue|wed|thu|fri|sat|sun|m|t|w|th|f|s)$', clean_txt):
            schedule_start_idx = j
            break

          # Stop at spatial gap followed by standalone units digit
          if desc_words:
            prev_idx = i + len(desc_words)
            if prev_idx < len(line):
              prev_word_right = line[prev_idx]['left'] + line[prev_idx]['width']
              gap = next_w['left'] - prev_word_right
              if gap > 50 and re.fullmatch(r'[1-9]', txt):
                schedule_start_idx = j + 1  # skip units digit
                break

          desc_words.append(txt)
          if next_w['conf'] > 0:
            confs.append(next_w['conf'])

        desc_text = ' '.join(desc_words).strip()
        desc_text = clean_subject_description(desc_text)
        avg_conf = sum(confs) / len(confs) if confs else 0.0

        # Extract schedule from remainder of line
        schedule = None
        if schedule_start_idx is not None:
          schedule = extract_schedule_from_line(line, schedule_start_idx)
        else:
          # Try full line after description words
          schedule = extract_schedule_from_line(line, i + len(desc_words) + 1)

        if desc_text and not any(s['code'] == code for s in subjects):
          subjects.append({
              'id': f'sub-{len(subjects) + 1}',
              'code': code,
              'description': desc_text,
              'confidence': round(avg_conf, 1),
              'needs_review': avg_conf < 40,
              'schedule': schedule,  # { days, time, room, instructor } or None
          })
        break

  # ── Second pass: fill in missing instructors from continuation lines ──────
  # Some COR formats put the instructor on the line immediately after the subject row.
  instructor_name_re = re.compile(
      r'^(?:[A-Z]{2,}|[A-Z][a-z]+)(?:\s+(?:[A-Z]{2,}|[A-Z][a-z]+)){1,5}$'
  )
  for idx, subject in enumerate(subjects):
    if subject['schedule'] and subject['schedule'].get('instructor'):
      continue  # already found on same line

    # Find the average Y of the line that had this subject code
    subject_line_top = None
    for line in lines:
      for w in line:
        if w['text'].upper() == subject['code']:
          subject_line_top = sum(ww['top'] for ww in line) / len(line)
          break
      if subject_line_top is not None:
        break

    if subject_line_top is None:
      continue

    # Look for the next line(s) below that look like a name only
    for line in lines:
      line_top = sum(w['top'] for w in line) / len(line)
      if line_top <= subject_line_top:
        continue
      if line_top - subject_line_top > 80:
        break  # too far below

      line_text = ' '.join(w['text'] for w in line).strip()

      # Skip lines that contain another subject code
      if any(code_pattern.match(w['text'].upper()) for w in line):
        break

      # Skip lines that look like schedule data
      if day_pattern.search(line_text) or time_pattern.search(line_text):
        continue

      # Check if the whole line looks like a name
      if instructor_name_re.match(line_text) and len(line_text) >= 5:
        if subject['schedule'] is None:
          subject['schedule'] = {'days': '', 'time': '', 'room': '', 'instructor': ''}
        subject['schedule']['instructor'] = line_text
        break

      # Also try extracting a name from a longer continuation line
      name_re2 = re.compile(
          r'\b(?:[A-Z]{2,}|[A-Z][a-z]+)(?:\s+(?:[A-Z]{2,}|[A-Z][a-z]+)){1,5}\b'
      )
      matches2 = name_re2.findall(line_text)
      ignore_w = {'Mon','Tue','Wed','Thu','Fri','Sat','Sun','TBA','Lab','Gym','Room','Lec'}
      candidates2 = [m for m in matches2 if len(m) >= 5 and m not in ignore_w]
      if candidates2:
        best = max(candidates2, key=len)
        if subject['schedule'] is None:
          subject['schedule'] = {'days': '', 'time': '', 'room': '', 'instructor': ''}
        subject['schedule']['instructor'] = best
        break

  return subjects


@app.post('/api/scan-cor')
async def scan_cor_endpoint(file: UploadFile = File(...)):
  image = load_image_from_bytes(file.file)
  data = get_ocr_dataframe_from_cv2(image)
  lines = group_text_into_lines(data, y_tolerance=14)

  name, name_conf = extract_student_name(lines)
  subjects = extract_table_subjects(lines)

  _, buffer = cv2.imencode('.jpg', image)
  encoded_image = base64.b64encode(buffer).decode('utf-8')
  base64_src = f'data:image/jpeg;base64,{encoded_image}'

  return {
      'name': name,
      'name_confidence': name_conf,
      'subjects': subjects,
      'image_preview': base64_src,
  }


if __name__ == '__main__':
  import uvicorn
  uvicorn.run(app, host='0.0.0.0', port=8000) 