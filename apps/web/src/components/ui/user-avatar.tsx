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
}: {
  name: string;
  image: string;
  extraInfo?: string;
}) {
  return (
    <div className="flex gap-1 rounded-md pl-0.5 text-sm font-medium md:flex-none md:justify-start">
      <Tooltip>
        <TooltipTrigger>
          <Avatar className="h-6 w-6">
            <AvatarImage src={image} alt={name} />
            <AvatarFallback>{name.slice(0)}</AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent side="left" asChild>
          <div className="bg-secondary text-secondary-foreground inline-block md:hidden">{name}</div>
        </TooltipContent>
      </Tooltip>
      <div className="hidden pl-0.5 pt-0.5 font-normal md:block">
        {name}
        {extraInfo ? (
          <span className="pl-1 text-xs text-gray-400">{extraInfo}</span>
        ) : (
          ""
        )}
      </div>
    </div>
  );
}
