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
  # Updated pattern to handle NBSC format: IT17, IT19, etc.
  code_pattern = re.compile(r'^(IT|ICS|ITE|IBM|IS)\d{2,4}$', re.IGNORECASE)

  for line in lines:
    for i, w in enumerate(line):
      raw_text = w['text'].upper()
      # Handle OCR misreads for IT codes
      if raw_text.startswith(('IT', 'ICS', 'ITE', 'IBM', 'IS')):
        prefix = raw_text[:2] if raw_text.startswith('IT') else raw_text[:3]
        digits = raw_text[len(prefix):].replace('O', '0')
        raw_text = prefix + digits

      if code_pattern.match(raw_text):
        code = raw_text
        desc_words = []
        confs = []

        stop_keywords = {
            'wedthu',
            'mon',
            'tue',
            'wed',
            'thu',
            'fri',
            'sat',
            'tba',
            'room',
            'f2f',
            'async',
            'lec',
            'lab',
            '(lec)',
            '(lab)',
            '(async)',
            '(f2f)',
        }

        for next_w in line[i + 1 :]:
          txt = next_w['text']
          clean_txt = (
              txt.lower().replace('(', '').replace(')', '').strip()
          )

          if clean_txt in stop_keywords or 'room' in clean_txt:
            break

          # Stop if a spatial gap occurs followed by a standalone Units digit
          if desc_words:
            prev_word_right = (
                line[i + len(desc_words)]['left']
                + line[i + len(desc_words)]['width']
            )
            gap = next_w['left'] - prev_word_right
            if gap > 40 and re.fullmatch(r'[1-9]', txt):
              break

          desc_words.append(txt)
          if next_w['conf'] > 0:
            confs.append(next_w['conf'])

        desc_text = ' '.join(desc_words).strip()
        desc_text = clean_subject_description(desc_text)

        avg_conf = sum(confs) / len(confs) if confs else 0.0

        if desc_text and not any(s['code'] == code for s in subjects):
          subjects.append({
              'id': f'sub-{len(subjects) + 1}',
              'code': code,
              'description': desc_text,
              'confidence': round(avg_conf, 1),
              'needs_review': avg_conf < MIN_CONFIDENCE_SUBJECT,
          })
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