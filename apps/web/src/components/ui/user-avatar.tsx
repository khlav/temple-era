"use client";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export default function UserAvatar({
  name,
  image,
  extraInfo,
  showLabel = true,
  tooltipSide = "top",
}: {
  name: string;
  image: string;
  extraInfo?: string;
  showLabel?: boolean;
  tooltipSide?: "top" | "left" | "right" | "bottom" | undefined;
}) {
  return (
    <div className="flex gap-1 rounded-md pl-0.5 text-sm font-medium md:flex-none md:justify-start">
      <Tooltip>
        <TooltipTrigger>
          <Avatar className="h-6 w-6">
            <AvatarFallback>{name[0]}</AvatarFallback>
            <AvatarImage src={image} className="cursor-default" />
          </Avatar>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} asChild>
          <div
            className={
              "inline-block bg-secondary text-secondary-foreground " +
              (showLabel ? "md:hidden" : "")
            }
          >
            {name}
          </div>
        </TooltipContent>
      </Tooltip>
      {showLabel && (
        <div className="hidden text-nowrap pl-0.5 pt-0.5 font-normal sm:block">
          {name}
          {extraInfo ? (
            <span className="pl-1 text-xs text-gray-400">{extraInfo}</span>
          ) : (
            ""
          )}
        </div>
      )}
    </div>
  );
}
