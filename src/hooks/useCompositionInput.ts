import { useState, useRef, useCallback, useEffect, type ChangeEvent, type CompositionEvent } from 'react'

export interface UseCompositionInputReturn {
  /** Current input value (including composition characters during IME input) */
  inputValue: string
  /** Whether the input is currently in composition state */
  isComposing: boolean
  /** Handler for input onChange event */
  handleChange: (e: ChangeEvent<HTMLInputElement>) => void
  /** Handler for compositionstart event */
  handleCompositionStart: () => void
  /** Handler for compositionend event */
  handleCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => void
  /** Manually set the input value */
  setInputValue: (value: string) => void
}

/**
 * Hook to handle IME composition input state
 *
 * Solves the issue where intermediate pinyin input (e.g., CJK character input)
 * should not trigger search/update until the composition is finalized.
 * Only triggers the callback after the user selects the final character.
 *
 * @param onCommit Callback triggered after composition ends, receives the finalized value
 * @param initialValue Initial value
 * @returns Input state and related handler functions
 */
export function useCompositionInput(
  onCommit: (value: string) => void,
  initialValue: string = ''
): UseCompositionInputReturn {
  const [inputValue, setInputValue] = useState(initialValue)
  const [isComposing, setIsComposing] = useState(false)
  const composingRef = useRef(false)

  useEffect(() => {
    if (!composingRef.current) {
      setInputValue(initialValue)
    }
  }, [initialValue])

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    // Update local display value so user sees the composition process
    setInputValue(e.target.value)

    // Only trigger callback when not in IME composition state
    if (!composingRef.current) {
      onCommit(e.target.value)
    }
  }, [onCommit])

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
    setIsComposing(true)
  }, [])

  const handleCompositionEnd = useCallback((e: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false
    setIsComposing(false)

    // When composition ends, use the finalized value to trigger callback
    const finalValue = e.currentTarget.value
    setInputValue(finalValue)
    onCommit(finalValue)
  }, [onCommit])

  const setInputValueWrapper = useCallback((value: string) => {
    setInputValue(value)
  }, [])

  return {
    inputValue,
    isComposing,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    setInputValue: setInputValueWrapper,
  }
}
