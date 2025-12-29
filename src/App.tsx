import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import SearchPage from './pages/SearchPage'
import ReportPage from './pages/ReportPage'

export default function App() {
  return (
    <div>
      <header style={{ padding: 16, borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/" style={{ textDecoration: 'none', color: '#fff' }}>
          <h1 style={{ margin: 0 }}>Inspection Reports</h1>
        </Link>
      </header>
      <main style={{ padding: 16 }}>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/reports/:reportId" element={<ReportPage />} />
        </Routes>
      </main>
    </div>
  )
}
