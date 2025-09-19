"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

interface GlobalQuickLauncherContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const GlobalQuickLauncherContext = createContext<
  GlobalQuickLauncherContextType | undefined
>(undefined);

export function GlobalQuickLauncherProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <GlobalQuickLauncherContext.Provider value={{ open, setOpen }}>
      {children}
    </GlobalQuickLauncherContext.Provider>
  );
}

export function useGlobalQuickLauncher() {
  const context = useContext(GlobalQuickLauncherContext);
  if (context === undefined) {
    throw new Error(
      "useGlobalQuickLauncher must be used within a GlobalQuickLauncherProvider",
    );
  }
  return context;
}
