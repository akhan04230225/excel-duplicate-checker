# Import FastAPI framework and CORS middleware
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# Create the FastAPI app instance
app = FastAPI()

# Allow requests from the Vite dev server (React frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend origin
    allow_credentials=True,
    allow_methods=["*"],   # Allow all HTTP methods
    allow_headers=["*"],   # Allow all headers
)

# Health-check endpoint — returns a simple status message
@app.get("/")
def root():
    return {"status": "Backend running"}


# Upload endpoint — accepts one Excel file and validates its extension
@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # Make sure a filename exists before checking the extension
    filename = file.filename or ""

    # Only allow Excel file types for now
    if not filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a .xlsx or .xls file.",
        )

    # Return basic file information without reading the file contents
    return {
        "filename": filename,
        "content_type": file.content_type,
    }
