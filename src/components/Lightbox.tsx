import React, { useEffect } from 'react'
import { ImageRef } from '../types'

interface Props {
  images: ImageRef[]
  initialIndex?: number
  onClose: () => void
}

export default function Lightbox({ images, initialIndex = 0, onClose }: Props) {
  const [index, setIndex] = React.useState(initialIndex)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex(i => Math.min(images.length - 1, i + 1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [images.length, onClose])

  if (!images || images.length === 0) return null

  const img = images[index]

  return (
    <div className="lightbox-overlay" role="dialog" aria-modal="true">
      <div className="lightbox-content">
        <button className="lightbox-close" aria-label="Close" onClick={onClose}>✕</button>
        <div className="lightbox-nav left">
          <button onClick={() => setIndex(i => Math.max(0, i - 1))} aria-label="Previous">◀</button>
        </div>
        <img src={img.url} alt={img.caption || `Image ${index + 1}`} />
        <div className="lightbox-nav right">
          <button onClick={() => setIndex(i => Math.min(images.length - 1, i + 1))} aria-label="Next">▶</button>
        </div>
        {img.caption && <div className="lightbox-caption">{img.caption}</div>}
        <div className="lightbox-footer">{index + 1} / {images.length}</div>
      </div>
    </div>
  )
}
