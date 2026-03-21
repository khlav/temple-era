"use client";

import * as React from "react";
import { useDebounce } from "use-debounce";
import { Input } from "~/components/ui/input";

type DebouncedInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "defaultValue"
> & {
  delay?: number;
  onDebouncedChange?: (value: string) => void;
  defaultValue?: string;
};

export const DebouncedInput = React.forwardRef<
  HTMLInputElement,
  DebouncedInputProps
>(function DebouncedInputImpl(
  { delay = 300, onDebouncedChange, defaultValue = "", onChange, ...props },
  ref,
) {
  const [value, setValue] = React.useState(defaultValue);
  const [debouncedValue] = useDebounce(value, delay);
  const isInitialMount = React.useRef(true);

  React.useEffect(() => {
    if (isInitialMount.current && defaultValue !== value) {
      setValue(defaultValue);
      isInitialMount.current = false;
    }
  }, [defaultValue, value]);

  React.useEffect(() => {
    if (!isInitialMount.current) {
      onDebouncedChange?.(debouncedValue);
    } else {
      isInitialMount.current = false;
    }
  }, [debouncedValue, onDebouncedChange]);

  return (
    <Input
      {...props}
      ref={ref}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange?.(e);
      }}
    />
  );
});
