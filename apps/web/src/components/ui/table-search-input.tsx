"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { DebouncedInput } from "~/components/ui/debounced-input";

type TableSearchInputProps = Omit<
  React.ComponentProps<typeof DebouncedInput>,
  "value" | "onDebouncedChange" | "defaultValue"
> & {
  defaultValue?: string;
  delay?: number;
  placeholder?: string;
  onDebouncedChange?: (value: string) => void;
  autoFocus?: boolean;
  onClear?: () => void;
  isLoading?: boolean;
};

export const TableSearchInput = React.forwardRef<
  HTMLInputElement,
  TableSearchInputProps
>(function TableSearchInputImpl(
  {
    defaultValue = "",
    delay = 300,
    placeholder = "Search…",
    className,
    onDebouncedChange,
    autoFocus,
    onClear,
    isLoading = false,
    ...props
  },
  ref,
) {
  const [inputValue, setInputValue] = React.useState(defaultValue);
  const [debouncedInputKey, setDebouncedInputKey] = React.useState(0);

  // Track immediate input value for clear button visibility
  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    },
    [],
  );

  // Handle clear button click
  const handleClear = React.useCallback(() => {
    setInputValue("");
    setDebouncedInputKey((prev) => prev + 1); // Force remount with empty value
    onDebouncedChange?.("");
    onClear?.();
  }, [onDebouncedChange, onClear]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        size={20}
      />
      <DebouncedInput
        {...props}
        key={debouncedInputKey}
        ref={ref}
        delay={delay}
        placeholder={isLoading ? "" : placeholder}
        className={`w-full pl-10 ${className ?? ""}`}
        defaultValue={debouncedInputKey === 0 ? defaultValue : ""}
        onChange={handleChange}
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
          onClick={handleClear}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
});
