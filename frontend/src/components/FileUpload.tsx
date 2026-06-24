import { useState } from 'react';
import type { ChangeEvent, CSSProperties, JSX } from 'react';

// FileUpload component — handles Excel file selection (no upload yet)
function FileUpload(): JSX.Element {
  // Track the name of the currently selected file
  const [fileName, setFileName] = useState<string | null>(null);

  // Called whenever the user picks a file from the input
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;
    setFileName(file ? file.name : null);
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
};

export default FileUpload;
