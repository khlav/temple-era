"use client";

import {Avatar, AvatarFallback, AvatarImage} from "~/components/ui/avatar";

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
    <div className="flex gap-1 rounded-md text-sm font-medium md:flex-none md:justify-start pl-0.5">
      <Avatar className="h-6 w-6">
        <AvatarImage src={image} />
        <AvatarFallback>{name.slice(0)}</AvatarFallback>
      </Avatar>
      <div className="pt-0.5 pl-0.5 hidden md:block font-normal">
          {name}
          {extraInfo ? (
            <span className="pl-1 text-gray-400 text-xs" >{extraInfo}</span>
          ) : (
            ""
          )}
        </div>
    </div>
  );
}
