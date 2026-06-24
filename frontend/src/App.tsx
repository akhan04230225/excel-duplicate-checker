import './App.css';

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
    </div>
  );
}

export default App;