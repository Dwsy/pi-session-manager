import { useEffect, useState } from 'react'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { invoke } from '@tauri-apps/api/core'

/**
 * Hook for window zoom level management with Cmd+/- hotkeys
 * In Tauri 2, get_zoom API is not available, so we manage zoom level in local state
 */
export function useZoomControl() {
  const [zoomLevel, setZoomLevel] = useState<number>(1.0)
  const [isLoading, setIsLoading] = useState(false)

  // Initialize zoom level from localStorage if available
  useEffect(() => {
    const loadZoomLevel = async () => {
      try {
        setIsLoading(true)
        const savedLevel = localStorage.getItem('zoomLevel')
        if (savedLevel) {
          const level = parseFloat(savedLevel)
          if (!isNaN(level) && level >= 0.75 && level <= 2.0) {
            setZoomLevel(level)
            await invoke('set_window_zoom_level', { level })
          } else {
            // Invalid or out-of-range saved level, reset to 1.0
            setZoomLevel(1.0)
            await invoke('set_window_zoom_level', { level: 1.0 })
            localStorage.setItem('zoomLevel', '1.0')
          }
        } else {
          // No saved level, set default to 1.0
          setZoomLevel(1.0)
          await invoke('set_window_zoom_level', { level: 1.0 })
          localStorage.setItem('zoomLevel', '1.0')
        }
      } catch (error) {
        console.warn('Failed to load zoom level:', error)
        // Fallback to 1.0 on error
        setZoomLevel(1.0)
      } finally {
        setIsLoading(false)
      }
    }

    loadZoomLevel()
  }, [])

  // Hotkey handlers
  const handleZoomIn = async () => {
    try {
      const newLevel = Math.min(zoomLevel + 0.1, 2.0) // Max 2.0
      await invoke('set_window_zoom_level', { level: newLevel })
      setZoomLevel(newLevel)
      localStorage.setItem('zoomLevel', newLevel.toString())
    } catch (error) {
      console.warn('Failed to zoom in:', error)
    }
  }

  const handleZoomOut = async () => {
    try {
      const newLevel = Math.max(zoomLevel - 0.1, 0.75) // Min 0.75
      await invoke('set_window_zoom_level', { level: newLevel })
      setZoomLevel(newLevel)
      localStorage.setItem('zoomLevel', newLevel.toString())
    } catch (error) {
      console.warn('Failed to zoom out:', error)
    }
  }

  const handleZoomReset = async () => {
    try {
      const newLevel = 1.0
      await invoke('set_window_zoom_level', { level: newLevel })
      setZoomLevel(newLevel)
      localStorage.setItem('zoomLevel', newLevel.toString())
    } catch (error) {
      console.warn('Failed to reset zoom:', error)
    }
  }

  // Register hotkeys
  useKeyboardShortcuts({
    'cmd+equal': handleZoomIn,
    'cmd+plus': handleZoomIn,
    'cmd+add': handleZoomIn,
    'cmd+minus': handleZoomOut,
    'cmd+0': handleZoomReset,
    'cmd+num+0': handleZoomReset,
  })

  return {
    zoomLevel,
    isLoading,
    resetZoom: handleZoomReset,
  }
}