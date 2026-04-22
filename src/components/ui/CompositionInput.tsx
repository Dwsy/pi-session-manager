import { useCallback, useRef, type ChangeEvent, type CompositionEvent, type InputHTMLAttributes, forwardRef } from 'react'

interface CompositionInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
}

/**
 * Input component with automatic IME composition handling
 *
 * Prevents search/trigger callbacks during pinyin input in Chinese/CJK IME.
 * Only fires onChange after composition is finalized.
 */
const CompositionInput = forwardRef(function CompositionInput({
  value,
  onChange,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: CompositionInputProps, ref: React.Ref<HTMLInputElement>) {
  const composingRef = useRef(false)

  const handleCompositionStart = useCallback((e: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = true
    onCompositionStart?.(e)
  }, [onCompositionStart])

  const handleCompositionEnd = useCallback((e: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false
    // Use the finalized value when composition ends
    const finalValue = e.currentTarget.value
    onChange(finalValue)
    onCompositionEnd?.(e)
  }, [onChange, onCompositionEnd])

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    // Only trigger onChange when not in composition state
    if (!composingRef.current) {
      onChange(e.target.value)
    }
  }, [onChange])

  return (
    <input
      {...props}
      ref={ref}
      value={value}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  )
})

export default CompositionInput
