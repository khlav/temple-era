"use client";

import { Search } from "lucide-react";
import { useGlobalQuickLauncher } from "~/contexts/global-quick-launcher-context";
import { SidebarMenuButton } from "~/components/ui/sidebar";

export function SidebarSearchBox() {
  const { setOpen } = useGlobalQuickLauncher();

  // Detect OS for proper key combination display
  const isMac =
    typeof window !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const keyCombo = isMac ? "⌘K" : "Ctrl+K";

  // Debug logging
  if (typeof window !== "undefined") {
    console.log("Platform:", navigator.platform);
    console.log("Is Mac:", isMac);
    console.log("Key combo:", keyCombo);
  }

  return (
    <SidebarMenuButton
      onClick={() => {
        console.log("Sidebar search clicked, setting open to true");
        setOpen(true);
      }}
      className="border-2 text-muted-foreground"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">Search ({keyCombo})</span>
    </SidebarMenuButton>
  );
}
