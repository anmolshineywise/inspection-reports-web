import React from 'react'

export default function Badge({ value }: { value?: number }) {
  if (value == null || value === 0) return null
  const v = value
  const color = v >= 4 ? '#16a34a' : v >= 3 ? '#f59e0b' : '#ef4444'
  return (
    <span className="rating-badge" style={{ background: color }} aria-hidden>{v}</span>
  )
}
