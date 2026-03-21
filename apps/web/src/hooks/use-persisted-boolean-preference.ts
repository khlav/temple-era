"use client";

import { useCallback, useEffect, useState } from "react";

interface UsePersistedBooleanPreferenceOptions {
  cookieName: string;
  defaultValue?: boolean;
  maxAge?: number;
}

type SetBooleanPreference = boolean | ((currentValue: boolean) => boolean);

function readBooleanCookie(cookieName: string, defaultValue: boolean) {
  if (typeof document === "undefined") return defaultValue;

  const value = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${cookieName}=`))
    ?.split("=")[1];

  if (value === "true") return true;
  if (value === "false") return false;
  return defaultValue;
}

function writeBooleanCookie(
  cookieName: string,
  value: boolean,
  maxAge: number,
) {
  if (typeof document === "undefined") return;

  document.cookie = `${cookieName}=${value}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function usePersistedBooleanPreference({
  cookieName,
  defaultValue = true,
  maxAge = 60 * 60 * 24 * 365,
}: UsePersistedBooleanPreferenceOptions) {
  const [value, setValueState] = useState(defaultValue);

  useEffect(() => {
    setValueState(readBooleanCookie(cookieName, defaultValue));
  }, [cookieName, defaultValue]);

  const setValue = useCallback(
    (nextValue: SetBooleanPreference) => {
      setValueState((currentValue) => {
        const resolvedValue =
          typeof nextValue === "function" ? nextValue(currentValue) : nextValue;

        writeBooleanCookie(cookieName, resolvedValue, maxAge);
        return resolvedValue;
      });
    },
    [cookieName, maxAge],
  );

  return [value, setValue] as const;
}
