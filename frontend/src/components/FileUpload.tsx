import axios from 'axios';
import { useState } from 'react';
import type { ChangeEvent, CSSProperties, JSX } from 'react';

interface UploadPreviewResponse {
  columns: string[];
  totalRows: number;
  totalColumns: number;
  duplicateRows: number;
  duplicateGroups: number;
  duplicateCheckColumns: string[];
  previewRows: PreviewRow[];
  allRows: PreviewRow[];
  currentPage: number;
  pageSize: number;
  totalPages: number;
  hasMoreRows: boolean;
  hasManyColumns: boolean;
  processingTimeSeconds: number;
}

interface PreviewRow {
  rowId: number;
  isDuplicate?: boolean;
  duplicateGroup?: number | null;
  [key: string]: string | number | boolean | null | undefined;
}

const PAGE_SIZE = 25;

const normalizeValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim().toLowerCase();
};

const recomputeDuplicates = (
  rows: PreviewRow[],
  duplicateCheckColumns: string[],
): {
  updatedRows: PreviewRow[];
  duplicateRows: number;
  duplicateGroups: number;
} => {
  const keyCounts = new Map<string, number>();

  for (const row of rows) {
    const key = duplicateCheckColumns
      .map((column) => normalizeValue(row[column]))
      .join('||');

    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }

  let nextGroupId = 1;
  const keyToGroup = new Map<string, number>();

  const updatedRows = rows.map((row) => {
    const key = duplicateCheckColumns
      .map((column) => normalizeValue(row[column]))
      .join('||');

    const isDuplicate = (keyCounts.get(key) ?? 0) > 1;
    let duplicateGroup: number | null = null;

    if (isDuplicate) {
      if (!keyToGroup.has(key)) {
        keyToGroup.set(key, nextGroupId);
        nextGroupId += 1;
      }
      duplicateGroup = keyToGroup.get(key) ?? null;
    }

    return {
      ...row,
      isDuplicate,
      duplicateGroup,
    };
  });

  const duplicateRows = updatedRows.filter((row) => row.isDuplicate).length;
  const duplicateGroups = new Set(
    updatedRows
      .map((row) => row.duplicateGroup)
      .filter((value): value is number => typeof value === 'number'),
  ).size;

  return {
    updatedRows,
    duplicateRows,
    duplicateGroups,
  };
};

// FileUpload component — handles Excel file selection and upload
function FileUpload(): JSX.Element {
  // Track the selected file and UI messages
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<UploadPreviewResponse | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);

  // Called whenever the user picks a file from the input
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;

    setSelectedFile(file);
    setFileName(file ? file.name : null);
    setSuccessMessage(null);
    setErrorMessage(null);
    setPreviewData(null);
    setCurrentPage(1);
    setSelectedRowIds([]);
  };

  // Upload file and fetch processed rows
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
      const response = await axios.post<UploadPreviewResponse>('http://localhost:8000/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setPreviewData(response.data);
      setCurrentPage(1);
      setSelectedRowIds([]);
      setSuccessMessage('File preview loaded successfully.');
    } catch (error: unknown) {
      if (axios.isAxiosError<{ detail?: string }>(error)) {
        const detail = error.response?.data?.detail;
        const message =
          typeof detail === 'string' ? detail : 'Upload failed. Please try again.';

        setErrorMessage(message);
        setPreviewData(null);
      } else {
        setErrorMessage('Upload failed. Please try again.');
        setPreviewData(null);
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Upload the selected file to the backend
  const handleUpload = async (): Promise<void> => {
    await uploadFile();
  };

  // Toggle one row checkbox
  const toggleRowSelection = (rowId: number): void => {
    setSelectedRowIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId],
    );
  };

  // Remove selected rows and recompute duplicate flags/counts
  const handleRemoveSelected = (): void => {
    if (!previewData || selectedRowIds.length === 0) {
      return;
    }

    const remainingRows = previewData.allRows.filter(
      (row) => !selectedRowIds.includes(row.rowId),
    );

    const duplicateResult = recomputeDuplicates(
      remainingRows,
      previewData.duplicateCheckColumns,
    );

    setPreviewData({
      ...previewData,
      allRows: duplicateResult.updatedRows,
      previewRows: duplicateResult.updatedRows.slice(0, PAGE_SIZE),
      totalRows: duplicateResult.updatedRows.length,
      duplicateRows: duplicateResult.duplicateRows,
      duplicateGroups: duplicateResult.duplicateGroups,
      totalPages: Math.max(1, Math.ceil(duplicateResult.updatedRows.length / PAGE_SIZE)),
      currentPage: 1,
      hasMoreRows: duplicateResult.updatedRows.length > PAGE_SIZE,
    });

    setCurrentPage(1);
    setSelectedRowIds([]);
    setSuccessMessage(`Removed ${selectedRowIds.length} record(s).`);
  };

  // Export remaining rows to .xlsx — xlsx is imported lazily to avoid blocking initial render
  const handleExport = async (): Promise<void> => {
    if (!previewData || previewData.allRows.length === 0) {
      return;
    }

    const XLSX = await import('xlsx');

    const exportRows = previewData.allRows.map((row) => {
      const exportRow: Record<string, string | number | boolean | null | undefined> = {};

      for (const column of previewData.columns) {
        exportRow[column] = row[column] ?? '';
      }

      return exportRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: previewData.columns });
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Remaining Records');
    XLSX.writeFile(workbook, 'remaining_records.xlsx');
  };

  const allRows = previewData?.allRows ?? [];
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const pagedRows = allRows.slice(startIndex, endIndex);

  const allRowsOnPageSelected =
    pagedRows.length > 0 && pagedRows.every((row) => selectedRowIds.includes(row.rowId));

  const toggleSelectAllOnPage = (): void => {
    const pageIds = pagedRows.map((row) => row.rowId);

    if (allRowsOnPageSelected) {
      setSelectedRowIds((prev) => prev.filter((id) => !pageIds.includes(id)));
      return;
    }

    setSelectedRowIds((prev) => Array.from(new Set([...prev, ...pageIds])));
  };

  return (
    <div style={styles.container}>
      <label htmlFor="excel-upload" style={styles.label}>
        Choose Excel File
      </label>

      {/* Accept only .xlsx and .xls formats */}
      <input
        id="excel-upload"
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        style={styles.input}
      />

      {/* Show the selected file name, or a placeholder if none chosen */}
      <p style={styles.fileName}>
        {fileName ? `Selected: ${fileName}` : 'No file selected'}
      </p>

      <button
        type="button"
        onClick={handleUpload}
        disabled={!selectedFile || isUploading}
        style={{
          ...styles.button,
          ...((!selectedFile || isUploading) ? styles.buttonDisabled : {}),
        }}
      >
        {isUploading ? 'Uploading...' : 'Upload'}
      </button>

      {successMessage && <p style={styles.successMessage}>{successMessage}</p>}
      {errorMessage && <p style={styles.errorMessage}>{errorMessage}</p>}

      {previewData && (
        <div style={styles.previewSection}>
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <p style={styles.summaryLabel}>Total rows</p>
              <p style={styles.summaryValue}>{previewData.totalRows}</p>
            </div>
            <div style={styles.summaryCard}>
              <p style={styles.summaryLabel}>Duplicate rows</p>
              <p style={styles.summaryValue}>{previewData.duplicateRows}</p>
            </div>
            <div style={styles.summaryCard}>
              <p style={styles.summaryLabel}>Duplicate groups</p>
              <p style={styles.summaryValue}>{previewData.duplicateGroups}</p>
            </div>
          </div>

          <div style={styles.actionsRow}>
            <button
              type="button"
              onClick={handleRemoveSelected}
              disabled={selectedRowIds.length === 0}
              style={{
                ...styles.removeButton,
                ...(selectedRowIds.length === 0 ? styles.removeButtonDisabled : {}),
              }}
            >
              Remove checked ({selectedRowIds.length})
            </button>

            <button
              type="button"
              onClick={handleExport}
              disabled={allRows.length === 0}
              style={{
                ...styles.exportButton,
                ...(allRows.length === 0 ? styles.exportButtonDisabled : {}),
              }}
            >
              Export remaining (.xlsx)
            </button>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeaderCheckbox}>
                    <input
                      type="checkbox"
                      checked={allRowsOnPageSelected}
                      onChange={toggleSelectAllOnPage}
                    />
                  </th>
                  {previewData.columns.map((column) => (
                    <th key={column} style={styles.tableHeader}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, rowIndex) => (
                  <tr
                    key={`row-${row.rowId}`}
                    style={row.isDuplicate ? styles.duplicateRow : undefined}
                  >
                    <td style={styles.tableCellCheckbox}>
                      <input
                        type="checkbox"
                        checked={selectedRowIds.includes(row.rowId)}
                        onChange={() => toggleRowSelection(row.rowId)}
                      />
                    </td>
                    {previewData.columns.map((column) => (
                      <td key={`${column}-${row.rowId}-${rowIndex}`} style={styles.tableCell}>
                        {String(row[column] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={styles.paginationContainer}>
            <button
              type="button"
              disabled={isUploading || safeCurrentPage <= 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              style={{
                ...styles.paginationButton,
                ...((isUploading || safeCurrentPage <= 1)
                  ? styles.paginationButtonDisabled
                  : {}),
              }}
            >
              Previous
            </button>

            <p style={styles.paginationText}>
              Page {safeCurrentPage} of {totalPages}
            </p>

            <button
              type="button"
              disabled={isUploading || safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              style={{
                ...styles.paginationButton,
                ...((isUploading || safeCurrentPage >= totalPages)
                  ? styles.paginationButtonDisabled
                  : {}),
              }}
            >
              Next
            </button>
          </div>

          <p style={styles.duplicateRuleText}>
            Duplicates are checked using First Name, Last Name, and Email.
          </p>

          {totalPages > 1 && (
            <p style={styles.noteText}>
              Showing 25 rows per page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Inline styles — simple and self-contained
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
    maxWidth: '1100px',
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
    // Visually hidden — the label acts as the clickable trigger
    display: 'none',
  },
  fileName: {
    fontSize: '0.9rem',
    color: '#555',
    margin: 0,
  },
  button: {
    padding: '0.6rem 1.25rem',
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
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
  previewSection: {
    width: '100%',
    marginTop: '1rem',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '0.75rem',
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
    margin: '0.3rem 0 0',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#111827',
    textAlign: 'left',
  },
  duplicateRow: {
    backgroundColor: '#fff1f2',
  },
  summaryText: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: 600,
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
    marginTop: '0.75rem',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '700px',
    backgroundColor: '#ffffff',
  },
  tableHeader: {
    padding: '0.75rem',
    borderBottom: '1px solid #d1d5db',
    backgroundColor: '#f3f4f6',
    textAlign: 'left',
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#111827',
    position: 'sticky',
    top: 0,
  },
  tableHeaderCheckbox: {
    width: '44px',
    minWidth: '44px',
    padding: '0.75rem 0.5rem',
    borderBottom: '1px solid #d1d5db',
    backgroundColor: '#f3f4f6',
    textAlign: 'center',
    position: 'sticky',
    top: 0,
  },
  tableCell: {
    padding: '0.75rem',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'left',
    fontSize: '0.9rem',
    color: '#374151',
    whiteSpace: 'nowrap',
  },
  tableCellCheckbox: {
    width: '44px',
    minWidth: '44px',
    textAlign: 'center',
    borderBottom: '1px solid #e5e7eb',
    padding: '0.75rem 0.5rem',
  },
  noteText: {
    margin: '0.75rem 0 0',
    fontSize: '0.85rem',
    color: '#6b7280',
    textAlign: 'left',
  },
  duplicateRuleText: {
    margin: '0.75rem 0 0',
    fontSize: '0.85rem',
    color: '#374151',
    textAlign: 'left',
  },
  actionsRow: {
    marginTop: '0.75rem',
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  removeButton: {
    border: 'none',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    borderRadius: '6px',
    padding: '0.5rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  removeButtonDisabled: {
    backgroundColor: '#fca5a5',
    cursor: 'not-allowed',
  },
  exportButton: {
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    borderRadius: '6px',
    padding: '0.5rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  exportButtonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
  },
  paginationContainer: {
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
    padding: '0.4rem 0.9rem',
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
};

export default FileUpload;
