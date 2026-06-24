import axios from 'axios';
import { useState } from 'react';
import type { ChangeEvent, CSSProperties, JSX } from 'react';

interface UploadPreviewResponse {
  columns: string[];
  totalRows: number;
  totalColumns: number;
  previewRows: PreviewRow[];
  hasMoreRows: boolean;
  hasManyColumns: boolean;
  processingTimeSeconds: number;
}

interface PreviewRow {
  [key: string]: string | number | boolean | null;
}

// FileUpload component — handles Excel file selection and upload
function FileUpload(): JSX.Element {
  // Track the selected file and UI messages
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<UploadPreviewResponse | null>(null);

  // Called whenever the user picks a file from the input
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;

    setSelectedFile(file);
    setFileName(file ? file.name : null);
    setSuccessMessage(null);
    setErrorMessage(null);
    setPreviewData(null);
  };

  // Upload the selected file to the backend
  const handleUpload = async (): Promise<void> => {
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
          <p style={styles.summaryText}>
            Total rows: {previewData.totalRows}
          </p>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {previewData.columns.map((column) => (
                    <th key={column} style={styles.tableHeader}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.previewRows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {previewData.columns.map((column) => (
                      <td key={`${column}-${rowIndex}`} style={styles.tableCell}>
                        {String(row[column] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewData.hasMoreRows && (
            <p style={styles.noteText}>
              Showing the first 25 rows only.
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
  tableCell: {
    padding: '0.75rem',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'left',
    fontSize: '0.9rem',
    color: '#374151',
    whiteSpace: 'nowrap',
  },
  noteText: {
    margin: '0.75rem 0 0',
    fontSize: '0.85rem',
    color: '#6b7280',
    textAlign: 'left',
  },
};

export default FileUpload;
