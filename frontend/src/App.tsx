import './App.css';
import { Component } from 'react';
import type { JSX, ReactNode } from 'react';
import FileUpload from './components/FileUpload';

// Catches any render-time errors and shows a message instead of a blank page
interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: '#dc2626' }}>
          <h2>Something went wrong</h2>
          <pre style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{this.state.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

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

      {/* File upload section wrapped in error boundary */}
      <ErrorBoundary>
        <FileUpload />
      </ErrorBoundary>
    </div>
  );
}

export default App;