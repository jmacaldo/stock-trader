import { useState, useRef, useEffect } from 'react'

// Native `title` tooltips don't work on touch devices, so compact badges need
// an explicit hover-or-tap popover to surface the flags behind a verdict.
export default function Tooltip({ content, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  if (!content) return children

  return (
    <span
      ref={ref}
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
    >
      {children}
      {open && (
        <span className="absolute z-50 bottom-full right-0 mb-1.5 w-64 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs leading-relaxed px-2.5 py-2 shadow-xl">
          {content}
        </span>
      )}
    </span>
  )
}
