import React from 'react'

export default function Badge({ value }: { value?: number | string }) {
  if (value == null || value === 0 || value === '') return null
  const s = String(value)
  if (s === 'N/A') {
    return <span className="rating-badge" style={{ background: '#9CA3AF' }} aria-hidden>N/A</span>
  }
  const num = Number(s)
  const color = num >= 3 ? '#16a34a' : num >= 2 ? '#f59e0b' : '#ef4444'
  return (
    <span className="rating-badge" style={{ background: color }} aria-hidden>{s}</span>
  )
} 
