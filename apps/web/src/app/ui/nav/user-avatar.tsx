"use client";

import * as Avatar from "@radix-ui/react-avatar";
import { type Session } from "next-auth";

interface UserLinkProps {
  session?: Session;
}

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
      <Avatar.Root className="inline-flex size-[24px] select-none items-center justify-center overflow-hidden rounded-full bg-gray-900">
        <Avatar.Image
          className="size-full rounded-[inherit] object-cover"
          src={image}
          alt={name}
        />
        <Avatar.Fallback
          className="leading-1 flex size-full items-center justify-center bg-white text-[24px] font-medium text-indigo-600"
          delayMs={600}
        >
          {name.substring(0, 1).toUpperCase()}
        </Avatar.Fallback>
      </Avatar.Root>
        <div className="pt-0.5 pl-0.5">
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
