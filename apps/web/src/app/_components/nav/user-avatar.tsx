"use client";

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
        <div className="pt-0.5 pl-0.5 hidden md:block ">
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
