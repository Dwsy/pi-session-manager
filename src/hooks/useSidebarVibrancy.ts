import { useState, useEffect, useCallback } from 'react';

const VIBRANCY_STORAGE_KEY = 'sidebar_vibrancy_enabled';

export function useSidebarVibrancy() {
  const [isVibrancyEnabled, setIsVibrancyEnabled] = useState<boolean>(true); // Always default to true

  useEffect(() => {
    try {
      localStorage.setItem(VIBRANCY_STORAGE_KEY, JSON.stringify(isVibrancyEnabled));
    } catch {
      // Ignore storage errors
    }
  }, [isVibrancyEnabled]);

  const toggleVibrancy = useCallback(() => {
    setIsVibrancyEnabled(prev => !prev);
  }, []);

  return { isVibrancyEnabled, toggleVibrancy };
}
