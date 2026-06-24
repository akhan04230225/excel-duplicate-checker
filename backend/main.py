# Import FastAPI framework and CORS middleware
from io import BytesIO
from time import perf_counter

import pandas as pd
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
    # Track processing time for the preview response
    start_time = perf_counter()

    # Make sure a filename exists before checking the extension
    filename = file.filename or ""

    # Only allow Excel file types for now
    if not filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a .xlsx or .xls file.",
        )

    # Read and parse the uploaded Excel file
    try:
        file_bytes = await file.read()
        dataframe = pd.read_excel(BytesIO(file_bytes))
    except Exception as exc:
        # Return a clear message for invalid/corrupted Excel files
        raise HTTPException(
            status_code=400,
            detail="Unable to read Excel file. Please upload a valid .xlsx or .xls file.",
        ) from exc

    # Convert missing values (NaN) to empty strings for the preview response
    cleaned_dataframe = dataframe.fillna("")

    # Detect duplicate rows across the entire row (all columns)
    duplicate_mask = cleaned_dataframe.duplicated(keep=False)

    # Build duplicate group IDs for rows that share identical values
    duplicate_groups = pd.Series([None] * len(cleaned_dataframe), index=cleaned_dataframe.index)
    if len(cleaned_dataframe.columns) > 0:
        group_codes = cleaned_dataframe.groupby(
            list(cleaned_dataframe.columns), dropna=False, sort=False
        ).ngroup() + 1
        duplicate_groups.loc[duplicate_mask] = group_codes.loc[duplicate_mask].astype(int)

    rows_with_flags = cleaned_dataframe.copy()
    rows_with_flags["isDuplicate"] = duplicate_mask
    rows_with_flags["duplicateGroup"] = duplicate_groups

    # Build response metadata without returning the full dataset
    columns = [str(column) for column in cleaned_dataframe.columns.tolist()]
    total_rows = len(cleaned_dataframe)
    total_columns = len(columns)
    duplicate_rows = int(duplicate_mask.sum())
    duplicate_groups_count = int(duplicate_groups.dropna().nunique())

    # Return only a preview subset, including duplicate markers
    preview_rows = rows_with_flags.head(25).to_dict(orient="records")
    processing_time_seconds = round(perf_counter() - start_time, 4)

    return {
        "columns": columns,
        "totalRows": total_rows,
        "totalColumns": total_columns,
        "duplicateRows": duplicate_rows,
        "duplicateGroups": duplicate_groups_count,
        "previewRows": preview_rows,
        "hasMoreRows": total_rows > 25,
        "hasManyColumns": total_columns > 20,
        "processingTimeSeconds": processing_time_seconds,
    }
