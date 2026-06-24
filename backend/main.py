# Import FastAPI framework and CORS middleware
from io import BytesIO
from time import perf_counter

import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
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
async def upload_file(
    file: UploadFile = File(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
):
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

    # Duplicate detection is based only on these columns
    duplicate_check_columns = ["First Name", "Last Name", "Email"]

    # Validate required columns before processing
    missing_columns = [
        column for column in duplicate_check_columns if column not in dataframe.columns
    ]
    if missing_columns:
        missing_text = ", ".join(missing_columns)
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {missing_text}",
        )

    # Convert missing values (NaN) to empty strings for the preview response
    cleaned_dataframe = dataframe.fillna("")

    # Normalize only duplicate-check columns for consistent comparison
    normalized_keys = cleaned_dataframe[duplicate_check_columns].apply(
        lambda series: series.fillna("").astype(str).str.strip().str.lower()
    )

    # Mark rows as duplicates when another row shares the same normalized key
    duplicate_mask = normalized_keys.duplicated(keep=False)

    # Build duplicate group IDs for rows that share identical normalized keys
    duplicate_groups = pd.Series([None] * len(cleaned_dataframe), index=cleaned_dataframe.index)
    if len(cleaned_dataframe) > 0:
        group_codes = normalized_keys.groupby(
            duplicate_check_columns, dropna=False, sort=False
        ).ngroup() + 1
        duplicate_groups.loc[duplicate_mask] = group_codes.loc[duplicate_mask].astype(int)

    rows_with_flags = cleaned_dataframe.copy()
    rows_with_flags["rowId"] = rows_with_flags.index + 1
    rows_with_flags["isDuplicate"] = duplicate_mask
    rows_with_flags["duplicateGroup"] = duplicate_groups

    # Build response metadata without returning the full dataset
    columns = [str(column) for column in cleaned_dataframe.columns.tolist()]
    total_rows = len(cleaned_dataframe)
    total_columns = len(columns)
    duplicate_rows = int(duplicate_mask.sum())
    duplicate_groups_count = int(duplicate_groups.dropna().nunique())

    # Return only one page of rows for performance
    total_pages = max(1, (total_rows + page_size - 1) // page_size)
    current_page = min(page, total_pages)
    start_index = (current_page - 1) * page_size
    end_index = start_index + page_size
    preview_rows = rows_with_flags.iloc[start_index:end_index].to_dict(orient="records")
    all_rows = rows_with_flags.to_dict(orient="records")
    processing_time_seconds = round(perf_counter() - start_time, 4)

    return {
        "columns": columns,
        "totalRows": total_rows,
        "totalColumns": total_columns,
        "duplicateRows": duplicate_rows,
        "duplicateGroups": duplicate_groups_count,
        "duplicateCheckColumns": duplicate_check_columns,
        "previewRows": preview_rows,
        "allRows": all_rows,
        "currentPage": current_page,
        "pageSize": page_size,
        "totalPages": total_pages,
        "hasMoreRows": end_index < total_rows,
        "hasManyColumns": total_columns > 20,
        "processingTimeSeconds": processing_time_seconds,
    }
