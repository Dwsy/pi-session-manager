import { forwardRef, useCallback, useEffect, useRef, useState, type ChangeEvent, type CompositionEvent, type InputHTMLAttributes } from 'react'

interface CompositionInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
}

/**
 * Input component with automatic IME composition handling.
 *
 * During IME composition (e.g. Chinese pinyin input), keep an internal draft
 * value so intermediate characters can render without switching the input
 * between controlled and uncontrolled modes.
 */
const CompositionInput = forwardRef(function CompositionInput({
  value,
  onChange,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: CompositionInputProps, ref: React.Ref<HTMLInputElement>) {
  const [isComposing, setIsComposing] = useState(false)
  const [draftValue, setDraftValue] = useState(value)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    setDraftValue(value)
  }, [value])

  const handleCompositionStart = useCallback((e: CompositionEvent<HTMLInputElement>) => {
    setIsComposing(true)
    setDraftValue(e.currentTarget.value)
    onCompositionStart?.(e)
  }, [onCompositionStart])

  const handleCompositionEnd = useCallback((e: CompositionEvent<HTMLInputElement>) => {
    const finalValue = e.currentTarget.value
    setDraftValue(finalValue)
    setIsComposing(false)
    onChangeRef.current(finalValue)
    onCompositionEnd?.(e)
  }, [onCompositionEnd])

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value
    setDraftValue(nextValue)

    if (!isComposing) {
      onChangeRef.current(nextValue)
    }
  }, [isComposing])

  return (
    <input
      {...props}
      ref={ref}
      value={isComposing ? draftValue : value}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  )
})

export default CompositionInput
