"use client"

import * as React from "react"
import { useDebouncedCallback } from "use-debounce"
import { Input } from "~/components/ui/input"

type DebouncedInputProps = React.ComponentProps<typeof Input> & {
  delay?: number
  onDebouncedChange?: (value: string) => void
}

export const DebouncedInput = React.forwardRef<HTMLInputElement, DebouncedInputProps>(
  function DebouncedInputImpl({ delay = 300, onDebouncedChange, onChange, ...props }, ref) {
    const debounced = useDebouncedCallback((val: string) => {
      onDebouncedChange?.(val)
    }, delay)

    return (
      <Input
        {...props}
        ref={ref}
        onChange={(e) => {
          onChange?.(e)
          debounced(e.target.value)
        }}
      />
    )
  }
)


