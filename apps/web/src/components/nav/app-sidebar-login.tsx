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
import { ChevronUp } from "lucide-react";
import { signIn, signOut } from "next-auth/react";

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
            <button onClick={() => signOut()} className="w-full cursor-pointer">Sign out</button>
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
          className="w-full bg-[#5865F2] transition-all duration-200 ease-in-out hover:bg-[#8891f2] md:pl-5"
        >
          {/*<PowerIcon className="w-6" />*/}
            <img
              src="/img/discord-mark-white.svg"
              alt="Discord"
              height={24}
              width={24}
            />
            <span className="hidden md:block">Sign in with Discord</span>
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return <SidebarMenu>{session ? userMenu : signInButton}</SidebarMenu>;
}
