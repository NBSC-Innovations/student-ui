# Student UI

A student management system with course enrollment, group chat, and OCR functionality for scanning COR (Certificate of Registration) images.

## Prerequisites

- Node.js 18+ and npm
- Python 3.8 or higher
- Tesseract OCR (for backend OCR functionality)

## Frontend Setup

1. Install dependencies:
`ash
npm install
`

2. Start the development server:
`ash
npm run dev
`

3. Build for production:
`ash
npm run build
`

## Backend OCR Setup

The backend provides OCR functionality for scanning COR images using Tesseract.

### Prerequisites

1. **Python 3.8 or higher** - Download from [python.org](https://www.python.org/downloads/)
2. **Tesseract OCR** - Download from [GitHub releases](https://github.com/UB-Mannheim/tesseract/wiki)
   - Install Tesseract-OCR to: C:\Program Files\Tesseract-OCR\tesseract.exe
   - The main.py file is already configured to use this path

### Installation

1. Open a terminal in the ackend directory:
`ash
cd backend
`

2. Create a virtual environment (recommended):
`ash
python -m venv venv
`

3. Activate the virtual environment:
`ash
venv\Scripts\activate
`

4. Install dependencies:
`ash
pip install -r requirements.txt
`

Or install individual packages:
`ash
pip install fastapi uvicorn[standard] opencv-python numpy pandas Pillow pytesseract python-multipart
`

### Running the Backend Server

Start the server on port 8000:
`ash
python main.py
`

Or using uvicorn directly:
`ash
uvicorn main:app --host 0.0.0.0 --port 8000
`

The server will start at: http://localhost:8000

### API Endpoint

**POST** /api/scan-cor

Upload a COR image file to extract:
- Student name
- Subject codes and descriptions
- OCR confidence scores

### Troubleshooting

**Tesseract not found error:**
- Ensure Tesseract is installed at C:\Program Files\Tesseract-OCR\tesseract.exe
- If installed elsewhere, update the TESSERACT_PATH in main.py

**Module not found errors:**
- Make sure you've activated the virtual environment
- Run pip install -r requirements.txt again

**Port 8000 already in use:**
- Change the port in the uvicorn.run() call at the bottom of main.py

## Database Setup

Run the database schema in Supabase SQL Editor:
- Open database-schema.sql
- Copy and paste the entire file into Supabase SQL Editor
- Execute to create all tables, policies, and functions

## Features

- Student authentication with OAuth (Google)
- Course enrollment and management
- Group chat functionality per course
- OCR scanning for COR images
- Real-time messaging
- Grade tracking
- Attendance management
