"use client";

import { Search } from "lucide-react";
import { useGlobalQuickLauncher } from "~/contexts/global-quick-launcher-context";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useEffect, useState } from "react";

export function SidebarSearchBox() {
  const { setOpen } = useGlobalQuickLauncher();
  const [keyCombo, setKeyCombo] = useState("Ctrl+K");

  // Detect OS for proper key combination display
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      setKeyCombo(isMac ? "⌘K" : "Ctrl+K");
    }
  }, []);

  return (
    <Button
      variant="ghost"
      onClick={() => {
        console.log("Sidebar search clicked, setting open to true");
        setOpen(true);
      }}
      className={cn(
        "w-full justify-start gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm text-muted-foreground",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">Search ({keyCombo})</span>
    </Button>
  );
}
