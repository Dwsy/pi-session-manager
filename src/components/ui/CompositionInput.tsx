import { useCallback, useRef, useState, type ChangeEvent, type CompositionEvent, type InputHTMLAttributes, forwardRef } from 'react'

interface CompositionInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
}

/**
 * Input component with automatic IME composition handling.
 *
 * During IME composition (e.g. Chinese pinyin input), the input temporarily
 * becomes uncontrolled so the DOM can display intermediate characters without
 * React reverting them. After composition ends, the final value is synced
 * back to the parent via onChange.
 */
const CompositionInput = forwardRef(function CompositionInput({
  value,
  onChange,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: CompositionInputProps, ref: React.Ref<HTMLInputElement>) {
  const [isComposing, setIsComposing] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const handleCompositionStart = useCallback((e: CompositionEvent<HTMLInputElement>) => {
    setIsComposing(true)
    onCompositionStart?.(e)
  }, [onCompositionStart])

  const handleCompositionEnd = useCallback((e: CompositionEvent<HTMLInputElement>) => {
    setIsComposing(false)
    const finalValue = e.currentTarget.value
    onChangeRef.current(finalValue)
    onCompositionEnd?.(e)
  }, [onCompositionEnd])

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (!isComposing) {
      onChangeRef.current(e.target.value)
    }
    // During composition: do nothing — DOM manages its own value
  }, [isComposing])

  return (
    <input
      {...props}
      ref={ref}
      // During composition, omit `value` so the input is temporarily uncontrolled.
      // This prevents React from reverting the DOM value and breaking IME.
      {...(isComposing ? {} : { value })}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  )
})

export default CompositionInput
