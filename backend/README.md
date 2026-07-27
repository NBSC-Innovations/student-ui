# Python OCR Backend Server

This backend server provides OCR functionality for scanning COR (Certificate of Registration) images using Tesseract OCR.

## Prerequisites

1. **Python 3.8 or higher** - Download from [python.org](https://www.python.org/downloads/)
2. **Tesseract OCR** - Download from [GitHub releases](https://github.com/UB-Mannheim/tesseract/wiki)
   - Install Tesseract-OCR to: `C:\Program Files\Tesseract-OCR\tesseract.exe`
   - The main.py file is already configured to use this path

## Installation

1. Open a terminal in the `backend` directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   ```

3. Activate the virtual environment:
   ```bash
   venv\Scripts\activate
   ```

4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Server

Start the server on port 8000:
```bash
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

The server will start at: `http://localhost:8000`

## API Endpoint

**POST** `/api/scan-cor`

Upload a COR image file to extract:
- Student name
- Subject codes and descriptions
- OCR confidence scores

## Troubleshooting

**Tesseract not found error:**
- Ensure Tesseract is installed at `C:\Program Files\Tesseract-OCR\tesseract.exe`
- If installed elsewhere, update the `TESSERACT_PATH` in `main.py`

**Module not found errors:**
- Make sure you've activated the virtual environment
- Run `pip install -r requirements.txt` again

**Port 8000 already in use:**
- Change the port in the `uvicorn.run()` call at the bottom of `main.py`
