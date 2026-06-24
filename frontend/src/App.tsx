import './App.css';
import type { JSX } from 'react';
import FileUpload from './components/FileUpload';

// Root application component
function App(): JSX.Element {
  return (
    <div className="app-container">
      {/* Page title */}
      <h1 className="app-title">Excel Duplicate Checker</h1>

      {/* Page subtitle */}
      <p className="app-subtitle">
        Upload an Excel file to find duplicate records.
      </p>
      {/* File upload input section */}
      <FileUpload />
    </div>
  );
}

export default App;