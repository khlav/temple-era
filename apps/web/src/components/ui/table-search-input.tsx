"use client"

import * as React from "react"
import { Search } from "lucide-react"
import { DebouncedInput } from "~/components/ui/debounced-input"

type TableSearchInputProps = Omit<React.ComponentProps<typeof DebouncedInput>, "value" | "onChange" | "onDebouncedChange"> & {
  initialValue?: string
  delay?: number
  placeholder?: string
  onDebouncedChange?: (value: string) => void
  autoFocus?: boolean
  onClear?: () => void
  isLoading?: boolean
}

export const TableSearchInput = React.forwardRef<HTMLInputElement, TableSearchInputProps>(
  function TableSearchInputImpl(
    {
      initialValue = "",
      delay = 300,
      placeholder = "Search…",
      className,
      onDebouncedChange,
      autoFocus,
      onClear,
      isLoading = false,
      ...props
    },
    ref
  ) {
    const [inputValue, setInputValue] = React.useState(initialValue)

    React.useEffect(() => {
      setInputValue(initialValue)
    }, [initialValue])

    return (
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <DebouncedInput
          {...props}
          ref={ref}
          delay={delay}
          placeholder={isLoading ? "" : placeholder}
          className={`pl-10 w-full ${className ?? ""}`}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value ?? "")}
          onDebouncedChange={onDebouncedChange}
          autoFocus={autoFocus}
        />
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 rounded-md bg-muted/30">
            <div className="absolute left-10 right-0 top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded">
              <div className="h-full w-2/3 animate-pulse bg-gradient-to-r from-muted/60 via-muted/40 to-muted/60" />
            </div>
          </div>
        )}
        {inputValue ? (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setInputValue("")
              onDebouncedChange?.("")
              onClear?.()
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
    )
  }
)


