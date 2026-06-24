import axios from 'axios';
import { useState } from 'react';
import type { ChangeEvent, CSSProperties, JSX } from 'react';

// FileUpload component — handles Excel file selection and upload
function FileUpload(): JSX.Element {
  // Track the selected file and UI messages
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Called whenever the user picks a file from the input
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;

    setSelectedFile(file);
    setFileName(file ? file.name : null);
    setSuccessMessage(null);
    setErrorMessage(null);
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
      const response = await axios.post<{ filename: string; content_type: string | null }>(
        'http://localhost:8000/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );

      setSuccessMessage(`Upload successful: ${response.data.filename}`);
    } catch (error: unknown) {
      if (axios.isAxiosError<{ detail?: string }>(error)) {
        const detail = error.response?.data?.detail;
        const message =
          typeof detail === 'string' ? detail : 'Upload failed. Please try again.';

        setErrorMessage(message);
      } else {
        setErrorMessage('Upload failed. Please try again.');
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
    maxWidth: '400px',
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
};

export default FileUpload;
