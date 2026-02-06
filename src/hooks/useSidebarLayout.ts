import { useCallback, useEffect, useRef, useState } from 'react'

interface UseSidebarLayoutOptions {
  minWidth: number
  maxWidth: number
  defaultWidth: number
  storageKey: string
}

interface UseSidebarLayoutResult {
  showSidebar: boolean
  setShowSidebar: React.Dispatch<React.SetStateAction<boolean>>
  sidebarWidth: number
  isResizing: boolean
  sidebarRef: React.RefObject<HTMLDivElement>
  resizeHandleRef: React.RefObject<HTMLDivElement>
  handleResizeStart: (event: React.MouseEvent) => void
}

export function useSidebarLayout({
  minWidth,
  maxWidth,
  defaultWidth,
  storageKey,
}: UseSidebarLayoutOptions): UseSidebarLayoutResult {
  const [showSidebar, setShowSidebar] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return saved ? parseInt(saved, 10) : defaultWidth
  })
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const resizeHandleRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const sidebarWidthRef = useRef(sidebarWidth)

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      setIsResizing(true)
      startXRef.current = event.clientX
      startWidthRef.current = sidebarWidth
    },
    [sidebarWidth]
  )

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - startXRef.current
      const nextWidth = startWidthRef.current + deltaX
      if (nextWidth >= minWidth && nextWidth <= maxWidth) {
        setSidebarWidth(nextWidth)
        sidebarWidthRef.current = nextWidth
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      localStorage.setItem(storageKey, sidebarWidthRef.current.toString())
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, maxWidth, minWidth, storageKey])

  return {
    showSidebar,
    setShowSidebar,
    sidebarWidth,
    isResizing,
    sidebarRef,
    resizeHandleRef,
    handleResizeStart,
  }
}
