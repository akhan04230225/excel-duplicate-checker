import axios from 'axios';
import { useState } from 'react';
import type { ChangeEvent, CSSProperties, JSX } from 'react';

type SheetKey = 'guestData' | 'richmondLocals';

interface TableRow {
  rowId: number;
  isDuplicate: boolean;
  duplicateGroup: number | null;
  [key: string]: string | number | boolean | null | undefined;
}

interface SheetPayload {
  sheetName: string;
  columns: string[];
  duplicateCheckColumns: string[];
  rows: TableRow[];
  totalRows: number;
  duplicateRows: number;
  duplicateGroups: number;
}

interface WorkbookResponse {
  guestData: SheetPayload;
  richmondLocals: SheetPayload;
  processingTimeSeconds: number;
}

interface SheetState extends SheetPayload {
  currentPage: number;
  pageSize: number;
  selectedRowIds: number[];
  deletedRows: number;
}

interface WorkbookState {
  guestData: SheetState;
  richmondLocals: SheetState;
  processingTimeSeconds: number;
}

const PAGE_SIZE = 25;

const NAME_COLUMNS_BY_SHEET: Record<SheetKey, string[]> = {
  guestData: ['guest first and last name'],
  richmondLocals: ['first name', 'last name'],
};

const PHONE_COLUMN_BY_SHEET: Record<SheetKey, string[]> = {
  guestData: ['guest phone number'],
  richmondLocals: [],
};

const STATE_COLUMN_BY_SHEET: Record<SheetKey, string[]> = {
  guestData: ['state'],
  richmondLocals: [],
};

const CITY_COLUMN_BY_SHEET: Record<SheetKey, string[]> = {
  guestData: ['city'],
  richmondLocals: [],
};

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

const normalizeValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim().toLowerCase();
};

const toTitleCase = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase());

const capitalizeFirstOnly = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const toPhoneFormat = (value: string): string => {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    const local = digits.slice(1);
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6, 10)}`;
  }

  return value;
};

const toStateCode = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const normalized = trimmed.toLowerCase();

  if (US_STATE_NAME_TO_CODE[normalized]) {
    return US_STATE_NAME_TO_CODE[normalized];
  }

  if (/^[a-z]{2}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return trimmed;
};

const isValidEmail = (value: string): boolean => {
  const email = value.trim().toLowerCase();

  // Basic structure checks
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) {
    return false;
  }

  const [, domain = ''] = email.split('@');

  // Domain labels must be non-empty and cannot start/end with '-'
  const labels = domain.split('.');
  if (labels.some((label) => label.length === 0 || label.startsWith('-') || label.endsWith('-'))) {
    return false;
  }

  // Catch common malformed Gmail typos observed in data
  if (/^gmai\.(co|com)$/i.test(domain) || /^gmal(com|\.com)$/i.test(domain)) {
    return false;
  }

  return true;
};

const hasInvalidGuestEmail = (sheetKey: SheetKey, row: TableRow): boolean => {
  if (sheetKey !== 'guestData') {
    return false;
  }

  const email = String(row['Guest Email'] ?? '').trim();
  return email.length > 0 && !isValidEmail(email);
};

const formatCellValue = (sheetKey: SheetKey, column: string, value: unknown): string => {
  const raw = value === null || value === undefined ? '' : String(value);
  const normalizedColumn = column.trim().toLowerCase();

  if (NAME_COLUMNS_BY_SHEET[sheetKey].includes(normalizedColumn)) {
    return toTitleCase(raw.trim());
  }

  if (PHONE_COLUMN_BY_SHEET[sheetKey].includes(normalizedColumn)) {
    return toPhoneFormat(raw.trim());
  }

  if (STATE_COLUMN_BY_SHEET[sheetKey].includes(normalizedColumn)) {
    return toStateCode(raw);
  }

  if (CITY_COLUMN_BY_SHEET[sheetKey].includes(normalizedColumn)) {
    return capitalizeFirstOnly(raw);
  }

  return raw;
};

const applySheetFormattingToRows = (sheetKey: SheetKey, rows: TableRow[]): TableRow[] =>
  rows.map((row) => {
    const formattedRow: TableRow = { ...row };

    for (const [column, value] of Object.entries(row)) {
      if (column === 'rowId' || column === 'isDuplicate' || column === 'duplicateGroup') {
        continue;
      }

      formattedRow[column] = formatCellValue(sheetKey, column, value);
    }

    return formattedRow;
  });

const summarizeDuplicates = (
  rows: TableRow[],
): { duplicateRows: number; duplicateGroups: number } => ({
  duplicateRows: rows.filter((row) => row.isDuplicate).length,
  duplicateGroups: new Set(
    rows
      .map((row) => row.duplicateGroup)
      .filter((value): value is number => typeof value === 'number'),
  ).size,
});

const detectGuestDuplicates = (rows: TableRow[]): TableRow[] => {
  const orderCounts = new Map<string, number>();
  const emailCounts = new Map<string, number>();

  for (const row of rows) {
    const name = normalizeValue(row['Guest First and Last Name']);
    const order = normalizeValue(row['Order #']);
    const email = normalizeValue(row['Guest Email']);

    if (order) {
      const orderKey = `${order}|${name}`;
      orderCounts.set(orderKey, (orderCounts.get(orderKey) ?? 0) + 1);
    }

    if (email) {
      const emailKey = `${email}|${name}`;
      emailCounts.set(emailKey, (emailCounts.get(emailKey) ?? 0) + 1);
    }
  }

  const orderGroupIds = new Map<string, number>();
  const emailGroupIds = new Map<string, number>();
  let nextGroupId = 1;

  return rows.map((row) => {
    const name = normalizeValue(row['Guest First and Last Name']);
    const order = normalizeValue(row['Order #']);
    const email = normalizeValue(row['Guest Email']);

    const orderKey = `${order}|${name}`;
    const emailKey = `${email}|${name}`;

    const orderDuplicate = Boolean(order) && (orderCounts.get(orderKey) ?? 0) > 1;
    const emailDuplicate = Boolean(email) && (emailCounts.get(emailKey) ?? 0) > 1;

    let duplicateGroup: number | null = null;
    if (orderDuplicate) {
      if (!orderGroupIds.has(orderKey)) {
        orderGroupIds.set(orderKey, nextGroupId);
        nextGroupId += 1;
      }
      duplicateGroup = orderGroupIds.get(orderKey) ?? null;
    } else if (emailDuplicate) {
      if (!emailGroupIds.has(emailKey)) {
        emailGroupIds.set(emailKey, nextGroupId);
        nextGroupId += 1;
      }
      duplicateGroup = emailGroupIds.get(emailKey) ?? null;
    }

    return {
      ...row,
      isDuplicate: orderDuplicate || emailDuplicate,
      duplicateGroup,
    };
  });
};

const detectRichmondDuplicates = (rows: TableRow[]): TableRow[] => {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const key = [
      normalizeValue(row['First Name']),
      normalizeValue(row['Last Name']),
      normalizeValue(row['Email Address']),
    ].join('|');

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const groupIds = new Map<string, number>();
  let nextGroupId = 1;

  return rows.map((row) => {
    const key = [
      normalizeValue(row['First Name']),
      normalizeValue(row['Last Name']),
      normalizeValue(row['Email Address']),
    ].join('|');

    const isDuplicate = (counts.get(key) ?? 0) > 1;
    let duplicateGroup: number | null = null;

    if (isDuplicate) {
      if (!groupIds.has(key)) {
        groupIds.set(key, nextGroupId);
        nextGroupId += 1;
      }
      duplicateGroup = groupIds.get(key) ?? null;
    }

    return {
      ...row,
      isDuplicate,
      duplicateGroup,
    };
  });
};

const rebuildGuestSheet = (rows: TableRow[], deletedRows = 0): SheetState => {
  const duplicatedRows = applySheetFormattingToRows('guestData', detectGuestDuplicates(rows));
  const summary = summarizeDuplicates(duplicatedRows);

  return {
    sheetName: 'Guest Data',
    columns: [
      'Order #',
      'Guest First and Last Name',
      'Guest Gender',
      'Guest Email',
      'Guest Phone Number',
      'City',
      'State',
    ],
    duplicateCheckColumns: ['Order #', 'Guest First and Last Name', 'Guest Email'],
    rows: duplicatedRows,
    totalRows: duplicatedRows.length,
    duplicateRows: summary.duplicateRows,
    duplicateGroups: summary.duplicateGroups,
    currentPage: 1,
    pageSize: PAGE_SIZE,
    selectedRowIds: [],
    deletedRows,
  };
};

const rebuildRichmondSheet = (rows: TableRow[], deletedRows = 0): SheetState => {
  const duplicatedRows = applySheetFormattingToRows('richmondLocals', detectRichmondDuplicates(rows));
  const summary = summarizeDuplicates(duplicatedRows);

  return {
    sheetName: 'Richmond Locals',
    columns: ['First Name', 'Last Name', 'Email Address'],
    duplicateCheckColumns: ['First Name', 'Last Name', 'Email Address'],
    rows: duplicatedRows,
    totalRows: duplicatedRows.length,
    duplicateRows: summary.duplicateRows,
    duplicateGroups: summary.duplicateGroups,
    currentPage: 1,
    pageSize: PAGE_SIZE,
    selectedRowIds: [],
    deletedRows,
  };
};

function FileUpload(): JSX.Element {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workbookData, setWorkbookData] = useState<WorkbookState | null>(null);
  const [guestEmailDrafts, setGuestEmailDrafts] = useState<Record<number, string>>({});

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setFileName(file ? file.name : null);
    setSuccessMessage(null);
    setErrorMessage(null);
    setWorkbookData(null);
    setGuestEmailDrafts({});
  };

  const uploadFile = async (): Promise<void> => {
    if (!selectedFile) {
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    setIsUploading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await axios.post<WorkbookResponse>('http://localhost:8000/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const initialGuestSheet = rebuildGuestSheet(response.data.guestData.rows as TableRow[]);
      const initialRichmondSheet = rebuildRichmondSheet(response.data.richmondLocals.rows as TableRow[]);

      setWorkbookData({
        guestData: initialGuestSheet,
        richmondLocals: initialRichmondSheet,
        processingTimeSeconds: response.data.processingTimeSeconds,
      });
      setGuestEmailDrafts({});

      setSuccessMessage('Workbook loaded successfully.');
    } catch (error: unknown) {
      if (axios.isAxiosError<{ detail?: string }>(error)) {
        const detail = error.response?.data?.detail;
        setErrorMessage(typeof detail === 'string' ? detail : 'Upload failed. Please try again.');
      } else {
        setErrorMessage('Upload failed. Please try again.');
      }

      setWorkbookData(null);
    } finally {
      setIsUploading(false);
    }
  };

  const updateSheet = (sheetKey: SheetKey, updater: (sheet: SheetState) => SheetState): void => {
    setWorkbookData((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        ...prev,
        [sheetKey]: updater(prev[sheetKey]),
      };
    });
  };

  const handleRemoveSelected = (sheetKey: SheetKey): void => {
    updateSheet(sheetKey, (sheet) => {
      if (sheet.selectedRowIds.length === 0) {
        return sheet;
      }

      const remainingRows = sheet.rows.filter((row) => !sheet.selectedRowIds.includes(row.rowId));
      const deletedCount = sheet.deletedRows + sheet.selectedRowIds.length;

      return sheetKey === 'guestData'
        ? rebuildGuestSheet(remainingRows, deletedCount)
        : rebuildRichmondSheet(remainingRows, deletedCount);
    });
  };

  const toggleRowSelection = (sheetKey: SheetKey, rowId: number): void => {
    updateSheet(sheetKey, (sheet) => ({
      ...sheet,
      selectedRowIds: sheet.selectedRowIds.includes(rowId)
        ? sheet.selectedRowIds.filter((id) => id !== rowId)
        : [...sheet.selectedRowIds, rowId],
    }));
  };

  const toggleSelectAllOnPage = (sheetKey: SheetKey, pageRowIds: number[]): void => {
    updateSheet(sheetKey, (sheet) => {
      const allSelected =
        pageRowIds.length > 0 && pageRowIds.every((rowId) => sheet.selectedRowIds.includes(rowId));

      return {
        ...sheet,
        selectedRowIds: allSelected
          ? sheet.selectedRowIds.filter((rowId) => !pageRowIds.includes(rowId))
          : Array.from(new Set([...sheet.selectedRowIds, ...pageRowIds])),
      };
    });
  };

  const handleGuestEmailDraftChange = (rowId: number, value: string): void => {
    setGuestEmailDrafts((prev) => ({
      ...prev,
      [rowId]: value,
    }));
  };

  const handleSaveGuestEmail = (rowId: number, currentEmail: string): void => {
    const draft = guestEmailDrafts[rowId];
    if (typeof draft !== 'string') {
      return;
    }

    const nextEmail = draft.trim();
    if (nextEmail === currentEmail.trim()) {
      return;
    }

    updateSheet('guestData', (sheet) => {
      const updatedRows = sheet.rows.map((row) =>
        row.rowId === rowId
          ? {
              ...row,
              'Guest Email': nextEmail,
            }
          : row,
      );

      const rebuilt = rebuildGuestSheet(updatedRows, sheet.deletedRows);
      return {
        ...rebuilt,
        currentPage: sheet.currentPage,
        selectedRowIds: sheet.selectedRowIds,
      };
    });

    setGuestEmailDrafts((prev) => {
      const updated = { ...prev };
      delete updated[rowId];
      return updated;
    });
  };

  const exportWorkbook = async (): Promise<void> => {
    if (!workbookData) {
      return;
    }

    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    const addSheet = (sheet: SheetState, sheetName: string): void => {
      const exportRows = sheet.rows.map((row) => {
        const record: Record<string, string | number | boolean | null | undefined> = {};

        for (const column of sheet.columns) {
          record[column] = row[column] ?? '';
        }

        return record;
      });

      const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: sheet.columns });
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    };

    addSheet(workbookData.guestData, 'Guest Data');
    addSheet(workbookData.richmondLocals, 'Richmond Locals');
    XLSX.writeFile(workbook, 'remaining_records.xlsx');
  };

  const renderSheet = (sheetKey: SheetKey, title: string): JSX.Element | null => {
    if (!workbookData) {
      return null;
    }

    const sheet = workbookData[sheetKey];
    if (!sheet || !Array.isArray(sheet.columns) || !Array.isArray(sheet.rows)) {
      return null;
    }

    const totalPages = Math.max(1, Math.ceil(sheet.rows.length / sheet.pageSize));
    const currentPage = Math.min(sheet.currentPage, totalPages);
    const startIndex = (currentPage - 1) * sheet.pageSize;
    const pageRows = sheet.rows.slice(startIndex, startIndex + sheet.pageSize);
    const pageRowIds = pageRows.map((row) => row.rowId);
    const allSelected =
      pageRows.length > 0 && pageRows.every((row) => sheet.selectedRowIds.includes(row.rowId));

    return (
      <section style={styles.sheetSection}>
        <div style={styles.sheetHeaderRow}>
          <div>
            <h2 style={styles.sheetTitle}>{title}</h2>
            <p style={styles.sheetSubtitle}>
              Duplicates are checked using{' '}
              {sheetKey === 'guestData'
                ? 'Order #, Guest First and Last Name, and Guest Email.'
                : 'First Name, Last Name, and Email Address.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleRemoveSelected(sheetKey)}
            disabled={sheet.selectedRowIds.length === 0}
            style={{
              ...styles.removeButton,
              ...(sheet.selectedRowIds.length === 0 ? styles.removeButtonDisabled : {}),
            }}
          >
            Remove checked ({sheet.selectedRowIds.length})
          </button>
        </div>

        <div style={styles.summaryGrid}>
          <SummaryCard label="Remaining rows" value={sheet.rows.length} />
          <SummaryCard label="Deleted rows" value={sheet.deletedRows} />
          <SummaryCard label="Duplicate rows" value={sheet.duplicateRows} />
          <SummaryCard label="Duplicate groups" value={sheet.duplicateGroups} />
        </div>

        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.checkboxHeaderCell}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => toggleSelectAllOnPage(sheetKey, pageRowIds)}
                  />
                </th>
                {sheet.columns.map((column) => (
                  <th key={column} style={styles.tableHeaderCell}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={`${sheetKey}-${row.rowId}`}
                  style={
                    hasInvalidGuestEmail(sheetKey, row)
                      ? styles.invalidEmailRow
                      : row.isDuplicate
                        ? styles.duplicateRow
                        : undefined
                  }
                >
                  <td style={styles.checkboxCell}>
                    <input
                      type="checkbox"
                      checked={sheet.selectedRowIds.includes(row.rowId)}
                      onChange={() => toggleRowSelection(sheetKey, row.rowId)}
                    />
                  </td>
                  {sheet.columns.map((column) => (
                    <td key={`${sheetKey}-${row.rowId}-${column}`} style={styles.tableCell}>
                      {sheetKey === 'guestData' && column.trim().toLowerCase() === 'guest email' && hasInvalidGuestEmail(sheetKey, row) ? (
                        <div style={styles.invalidEmailEditContainer}>
                          <input
                            type="text"
                            value={guestEmailDrafts[row.rowId] ?? String(row['Guest Email'] ?? '')}
                            onChange={(e) => handleGuestEmailDraftChange(row.rowId, e.target.value)}
                            style={styles.invalidEmailInput}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveGuestEmail(row.rowId, String(row['Guest Email'] ?? ''))}
                            style={styles.invalidEmailSaveButton}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        formatCellValue(sheetKey, column, row[column])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={styles.paginationRow}>
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() =>
              updateSheet(sheetKey, (value) => ({
                ...value,
                currentPage: Math.max(1, value.currentPage - 1),
              }))
            }
            style={{
              ...styles.paginationButton,
              ...(currentPage <= 1 ? styles.paginationButtonDisabled : {}),
            }}
          >
            Previous
          </button>

          <p style={styles.paginationText}>
            Page {currentPage} of {totalPages}
          </p>

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() =>
              updateSheet(sheetKey, (value) => ({
                ...value,
                currentPage: Math.min(totalPages, value.currentPage + 1),
              }))
            }
            style={{
              ...styles.paginationButton,
              ...(currentPage >= totalPages ? styles.paginationButtonDisabled : {}),
            }}
          >
            Next
          </button>
        </div>

        <p style={styles.noteText}>
          Showing {pageRows.length} of {sheet.rows.length} rows on this page.
        </p>
      </section>
    );
  };

  return (
    <div style={styles.container}>
      <label htmlFor="excel-upload" style={styles.label}>
        Choose Excel File
      </label>

      <input
        id="excel-upload"
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        style={styles.input}
      />

      <p style={styles.fileName}>{fileName ? `Selected: ${fileName}` : 'No file selected'}</p>

      <button
        type="button"
        onClick={uploadFile}
        disabled={!selectedFile || isUploading}
        style={{
          ...styles.uploadButton,
          ...((!selectedFile || isUploading) ? styles.uploadButtonDisabled : {}),
        }}
      >
        {isUploading ? 'Uploading...' : 'Upload'}
      </button>

      {successMessage && <p style={styles.successMessage}>{successMessage}</p>}
      {errorMessage && <p style={styles.errorMessage}>{errorMessage}</p>}

      {workbookData && (
        <>
          <div style={styles.exportBar}>
            <button
              type="button"
              onClick={exportWorkbook}
              disabled={
                workbookData.guestData.rows.length === 0 && workbookData.richmondLocals.rows.length === 0
              }
              style={{
                ...styles.exportButton,
                ...(workbookData.guestData.rows.length === 0 &&
                workbookData.richmondLocals.rows.length === 0
                  ? styles.exportButtonDisabled
                  : {}),
              }}
            >
              Export remaining records to .xlsx
            </button>

            <p style={styles.exportNote}>
              A single Excel workbook will be created with Guest Data and Richmond Locals tabs.
            </p>
          </div>

          {renderSheet('guestData', 'Guest Data')}
          {renderSheet('richmondLocals', 'Richmond Locals')}

          <p style={styles.processingText}>
            Processing time: {workbookData.processingTimeSeconds.toFixed(4)} seconds
          </p>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div style={styles.summaryCard}>
      <p style={styles.summaryLabel}>{label}</p>
      <p style={styles.summaryValue}>{value}</p>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    marginTop: '1.5rem',
    padding: '1.5rem 2rem',
    border: '2px dashed #ccc',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '1400px',
  },
  label: {
    display: 'inline-block',
    padding: '0.5rem 1.25rem',
    backgroundColor: '#6366f1',
    color: '#fff',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  input: {
    display: 'none',
  },
  fileName: {
    fontSize: '0.9rem',
    color: '#555',
    margin: 0,
  },
  uploadButton: {
    padding: '0.6rem 1.25rem',
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  uploadButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  exportBar: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.5rem',
    marginTop: '0.75rem',
  },
  exportButton: {
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#fff',
    borderRadius: '6px',
    padding: '0.6rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  exportButtonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
  },
  exportNote: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#4b5563',
    textAlign: 'left',
  },
  successMessage: {
    fontSize: '0.9rem',
    color: '#15803d',
    margin: 0,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: '0.9rem',
    color: '#dc2626',
    margin: 0,
    textAlign: 'center',
  },
  sheetSection: {
    width: '100%',
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e5e7eb',
  },
  sheetHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    marginBottom: '0.75rem',
    flexWrap: 'wrap',
  },
  sheetTitle: {
    margin: 0,
    fontSize: '1.4rem',
    fontWeight: 700,
    color: '#111827',
    textAlign: 'left',
  },
  sheetSubtitle: {
    margin: '0.35rem 0 0',
    fontSize: '0.9rem',
    color: '#4b5563',
    textAlign: 'left',
  },
  removeButton: {
    border: 'none',
    backgroundColor: '#dc2626',
    color: '#fff',
    borderRadius: '6px',
    padding: '0.6rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  removeButtonDisabled: {
    backgroundColor: '#fca5a5',
    cursor: 'not-allowed',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '0.75rem',
    width: '100%',
    marginBottom: '0.75rem',
  },
  summaryCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: '#f9fafb',
    padding: '0.75rem',
  },
  summaryLabel: {
    margin: 0,
    fontSize: '0.8rem',
    color: '#6b7280',
    textAlign: 'left',
  },
  summaryValue: {
    margin: '0.25rem 0 0',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#111827',
    textAlign: 'left',
  },
  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: '420px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    marginTop: '0.25rem',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '900px',
    backgroundColor: '#ffffff',
  },
  tableHeaderCell: {
    padding: '0.75rem',
    borderBottom: '1px solid #d1d5db',
    backgroundColor: '#f3f4f6',
    textAlign: 'left',
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#111827',
    position: 'sticky',
    top: 0,
    zIndex: 1,
    whiteSpace: 'nowrap',
  },
  checkboxHeaderCell: {
    width: '44px',
    minWidth: '44px',
    padding: '0.75rem 0.5rem',
    borderBottom: '1px solid #d1d5db',
    backgroundColor: '#f3f4f6',
    textAlign: 'center',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  tableCell: {
    padding: '0.75rem',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'left',
    fontSize: '0.9rem',
    color: '#374151',
    whiteSpace: 'nowrap',
  },
  checkboxCell: {
    width: '44px',
    minWidth: '44px',
    textAlign: 'center',
    borderBottom: '1px solid #e5e7eb',
    padding: '0.75rem 0.5rem',
  },
  duplicateRow: {
    backgroundColor: '#fff1f2',
  },
  invalidEmailRow: {
    backgroundColor: 'rgba(255, 0, 0, 0.12)',
  },
  invalidEmailEditContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    minWidth: '260px',
  },
  invalidEmailInput: {
    flex: 1,
    minWidth: '180px',
    border: '1px solid #fca5a5',
    borderRadius: '6px',
    padding: '0.35rem 0.45rem',
    fontSize: '0.85rem',
    color: '#111827',
    backgroundColor: '#fff',
  },
  invalidEmailSaveButton: {
    border: 'none',
    borderRadius: '6px',
    padding: '0.35rem 0.55rem',
    backgroundColor: '#b91c1c',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  paginationRow: {
    marginTop: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
  },
  paginationButton: {
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    borderRadius: '6px',
    padding: '0.45rem 0.9rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#111827',
    cursor: 'pointer',
  },
  paginationButtonDisabled: {
    cursor: 'not-allowed',
    color: '#9ca3af',
    backgroundColor: '#f3f4f6',
  },
  paginationText: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#374151',
    fontWeight: 600,
  },
  noteText: {
    margin: '0.6rem 0 0',
    fontSize: '0.85rem',
    color: '#6b7280',
    textAlign: 'left',
  },
  processingText: {
    marginTop: '1rem',
    fontSize: '0.85rem',
    color: '#6b7280',
  },
};

export default FileUpload;
