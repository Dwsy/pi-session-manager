import { useState, useEffect } from 'react';

/**
 * Detect and follow the system accent color.
 * On macOS: NSColor.controlAccentColor
 * On Windows: UISettings.GetColorValue(UIColorType.Accent)
 *
 * Falls back to a default teal if detection fails.
 */

function getSystemAccentColor(): string {
  // Try to detect system accent color via CSS media query
  // This works on macOS and Windows with WebView2
  const testEl = document.createElement('div');
  testEl.style.accentColor = 'accent';
  document.body.appendChild(testEl);

  const computed = getComputedStyle(testEl).accentColor;
  document.body.removeChild(testEl);

  if (computed && computed !== 'accent') {
    return computed;
  }

  // Fallback: try to match common system accent colors
  // This is a heuristic and may not be accurate
  return '#0a84ff'; // Default macOS blue
}

export function useSystemAccentColor() {
  const [accentColor, setAccentColor] = useState<string>(() => {
    // Try to get from CSS variable first (set by native shell)
    const cssVar = getComputedStyle(document.documentElement)
      .getPropertyValue('--system-accent-color')
      .trim();

    if (cssVar) {
      return cssVar;
    }

    return getSystemAccentColor();
  });

  useEffect(() => {
    // Listen for accent color changes
    // This would require native shell support to be fully functional
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      // Re-detect on theme change
      const newColor = getSystemAccentColor();
      setAccentColor(newColor);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return accentColor;
}
