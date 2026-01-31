import { useState, useRef, useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface HoverPreviewProps {
  content: ReactNode
  previewContent: ReactNode
  delay?: number
  maxWidth?: number
  maxHeight?: number
}

export default function HoverPreview({
  content,
  previewContent,
  delay = 500,
  maxWidth = 600,
  maxHeight = 400
}: HoverPreviewProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    
    // 计算预览框的位置
    let x = rect.left
    let y = rect.bottom + 8
    
    // 如果右侧空间不足，向左对齐
    if (x + maxWidth > window.innerWidth) {
      x = window.innerWidth - maxWidth - 16
    }
    
    // 如果下方空间不足，显示在上方
    if (y + maxHeight > window.innerHeight) {
      y = rect.top - maxHeight - 8
    }
    
    setPosition({ x, y })
    
    // 延迟显示
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'inline-block', cursor: 'help' }}
      >
        {content}
      </div>
      
      {isVisible && createPortal(
        <div
          className="hover-preview"
          style={{
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            maxWidth: `${maxWidth}px`,
            maxHeight: `${maxHeight}px`,
            zIndex: 9999
          }}
          onMouseEnter={() => {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current)
              timeoutRef.current = null
            }
          }}
          onMouseLeave={handleMouseLeave}
        >
          <div className="hover-preview-content">
            {previewContent}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
