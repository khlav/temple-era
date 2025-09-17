"use client"

import { InfoIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"

export function TableSearchTips({ children, side = "bottom", align = "start" }: { children: React.ReactNode, side?: "top" | "right" | "bottom" | "left", align?: "start" | "center" | "end" }) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
          <InfoIcon size={12} />
          <span>Search tips</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side={side} align={align} className="max-w-xs text-xs p-3 bg-muted text-muted-foreground">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}


