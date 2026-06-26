from io import BytesIO
from time import perf_counter

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GUEST_SHEET = "Guest Data"
RICHMOND_SHEET = "Richmond Locals"

GUEST_COLUMNS = [
    "Order #",
    "Guest First and Last Name",
    "Guest Gender",
    "Guest Email",
    "Guest Phone Number",
    "City",
    "State",
]

GUEST_DUPLICATE_COLUMNS = [
    "Order #",
    "Guest First and Last Name",
    "Guest Email",
]

RICHMOND_COLUMNS = ["First Name", "Last Name", "Email Address"]
RICHMOND_DUPLICATE_COLUMNS = ["First Name", "Last Name", "Email Address"]


def normalize_value(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def validate_columns(dataframe: pd.DataFrame, required_columns: list[str], sheet_name: str) -> None:
    missing_columns = [column for column in required_columns if column not in dataframe.columns]
    if missing_columns:
        missing_text = ", ".join(missing_columns)
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns in {sheet_name}: {missing_text}",
        )


def build_sheet_rows(
    dataframe: pd.DataFrame,
    display_columns: list[str],
    duplicate_rule,
) -> tuple[list[dict[str, object]], int, int]:
    cleaned = dataframe.fillna("")
    display_frame = cleaned[display_columns].copy()

    duplicate_mask, duplicate_groups = duplicate_rule(display_frame)

    rows = display_frame.to_dict(orient="records")
    total_duplicate_rows = 0
    duplicate_group_ids = set()

    for index, row in enumerate(rows):
        row["rowId"] = index + 1
        row["isDuplicate"] = bool(duplicate_mask[index])
        duplicate_group = duplicate_groups[index]
        row["duplicateGroup"] = duplicate_group
        if row["isDuplicate"]:
            total_duplicate_rows += 1
        if duplicate_group is not None:
            duplicate_group_ids.add(duplicate_group)

    return rows, total_duplicate_rows, len(duplicate_group_ids)


def detect_guest_duplicates(dataframe: pd.DataFrame) -> tuple[list[bool], list[int | None]]:
    order_counts: dict[tuple[str, str], int] = {}
    email_counts: dict[tuple[str, str], int] = {}

    normalized_rows = []
    for _, row in dataframe.iterrows():
        order_value = normalize_value(row["Order #"])
        name_value = normalize_value(row["Guest First and Last Name"])
        email_value = normalize_value(row["Guest Email"])
        normalized_rows.append((order_value, name_value, email_value))

        if order_value:
            order_key = (order_value, name_value)
            order_counts[order_key] = order_counts.get(order_key, 0) + 1

        if email_value:
            email_key = (email_value, name_value)
            email_counts[email_key] = email_counts.get(email_key, 0) + 1

    duplicate_mask: list[bool] = []
    duplicate_groups: list[int | None] = []
    order_group_ids: dict[tuple[str, str], int] = {}
    email_group_ids: dict[tuple[str, str], int] = {}
    next_group_id = 1

    for order_value, name_value, email_value in normalized_rows:
        order_key = (order_value, name_value)
        email_key = (email_value, name_value)

        is_order_duplicate = bool(order_value) and order_counts.get(order_key, 0) > 1
        is_email_duplicate = bool(email_value) and email_counts.get(email_key, 0) > 1
        is_duplicate = is_order_duplicate or is_email_duplicate

        group_id: int | None = None
        if is_order_duplicate:
            if order_key not in order_group_ids:
                order_group_ids[order_key] = next_group_id
                next_group_id += 1
            group_id = order_group_ids[order_key]
        elif is_email_duplicate:
            if email_key not in email_group_ids:
                email_group_ids[email_key] = next_group_id
                next_group_id += 1
            group_id = email_group_ids[email_key]

        duplicate_mask.append(is_duplicate)
        duplicate_groups.append(group_id)

    return duplicate_mask, duplicate_groups


def detect_richmond_duplicates(dataframe: pd.DataFrame) -> tuple[list[bool], list[int | None]]:
    normalized_keys: list[tuple[str, str, str]] = []
    counts: dict[tuple[str, str, str], int] = {}

    for _, row in dataframe.iterrows():
        first_name = normalize_value(row["First Name"])
        last_name = normalize_value(row["Last Name"])
        email = normalize_value(row["Email Address"])
        key = (first_name, last_name, email)
        normalized_keys.append(key)
        counts[key] = counts.get(key, 0) + 1

    duplicate_mask: list[bool] = []
    duplicate_groups: list[int | None] = []
    group_ids: dict[tuple[str, str, str], int] = {}
    next_group_id = 1

    for key in normalized_keys:
        is_duplicate = counts.get(key, 0) > 1
        group_id: int | None = None
        if is_duplicate:
            if key not in group_ids:
                group_ids[key] = next_group_id
                next_group_id += 1
            group_id = group_ids[key]

        duplicate_mask.append(is_duplicate)
        duplicate_groups.append(group_id)

    return duplicate_mask, duplicate_groups


def build_sheet_payload(
    dataframe: pd.DataFrame,
    sheet_name: str,
    display_columns: list[str],
    duplicate_columns: list[str],
    duplicate_rule,
) -> dict[str, object]:
    validate_columns(dataframe, display_columns, sheet_name)
    validate_columns(dataframe, duplicate_columns, sheet_name)

    rows, duplicate_rows, duplicate_groups = build_sheet_rows(dataframe, display_columns, duplicate_rule)

    return {
        "sheetName": sheet_name,
        "columns": display_columns,
        "duplicateCheckColumns": duplicate_columns,
        "rows": rows,
        "totalRows": len(rows),
        "duplicateRows": duplicate_rows,
        "duplicateGroups": duplicate_groups,
    }


@app.get("/")
def root():
    return {"status": "Backend running"}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    start_time = perf_counter()

    filename = file.filename or ""
    if not filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a .xlsx or .xls file.",
        )

    try:
        file_bytes = await file.read()
        workbook = pd.ExcelFile(BytesIO(file_bytes))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Unable to read Excel file. Please upload a valid .xlsx or .xls file.",
        ) from exc

    missing_sheets = [
        sheet_name for sheet_name in [GUEST_SHEET, RICHMOND_SHEET] if sheet_name not in workbook.sheet_names
    ]
    if missing_sheets:
        missing_text = ", ".join(missing_sheets)
        raise HTTPException(
            status_code=400,
            detail=f"Missing required sheet(s): {missing_text}",
        )

    try:
        guest_dataframe = workbook.parse(GUEST_SHEET)
        richmond_dataframe = workbook.parse(RICHMOND_SHEET)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Unable to read the required worksheet data.",
        ) from exc

    guest_data = build_sheet_payload(
        guest_dataframe,
        GUEST_SHEET,
        GUEST_COLUMNS,
        GUEST_DUPLICATE_COLUMNS,
        detect_guest_duplicates,
    )
    richmond_locals = build_sheet_payload(
        richmond_dataframe,
        RICHMOND_SHEET,
        RICHMOND_COLUMNS,
        RICHMOND_DUPLICATE_COLUMNS,
        detect_richmond_duplicates,
    )

    return {
        "guestData": guest_data,
        "richmondLocals": richmond_locals,
        "processingTimeSeconds": round(perf_counter() - start_time, 4),
    }
