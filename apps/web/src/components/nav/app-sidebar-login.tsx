"use client";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Session } from "next-auth";
import {ChevronUp, LogOut, User} from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import Link from "next/link";

export function AppSidebarLogin({ session }: { session: Session | null }) {
  const userMenu = (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton>
            <img
              alt={"Username: " + session?.user?.name}
              src={session?.user?.image ?? undefined}
              className="object-fit rounded-full"
              height={24}
              width={24}
            />
            {session?.user?.name}
            <ChevronUp className="ml-auto" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          className="w-[--radix-popper-anchor-width]"
        >
          <DropdownMenuItem asChild>
            <Link href="/profile" className="flex flex-row w-full cursor-pointer"><User /><div className="shrink">Profile</div></Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button onClick={() => signOut()} className="w-full cursor-pointer flex flex-row"><LogOut />Sign out</button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );

  const signInButton = (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <button
          onClick={() => signIn("discord")}
          className="w-full bg-[#5865F2] flex items-center justify-center gap-2 transition-all duration-200 ease-in-out hover:bg-[#8891f2] md:pl-5"
        >
          {/* Uncomment and use this icon if needed */}
          {/* <PowerIcon className="w-6" /> */}
          <img
            src="/img/discord-mark-white.svg"
            alt="Discord"
            height={24}
            width={24}
          />
          <span className="text-secondary-foreground">Sign in with Discord</span>
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return <SidebarMenu>{session ? userMenu : signInButton}</SidebarMenu>;
}
