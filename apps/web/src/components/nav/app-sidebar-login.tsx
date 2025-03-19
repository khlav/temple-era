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
import { ChevronDown, LogOut, User } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import posthog from "posthog-js";
import {PostHogIdentify} from "~/app/providers";

export function AppSidebarLogin({ session }: { session: Session | null }) {
  const handleSignIn = () => signIn("discord");

  const handleSignOut = () => {
    posthog.reset();
    void signOut();
  };
  const userMenu = (
    <SidebarMenuItem>
      <PostHogIdentify session={session} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton className="border-2">
            <img
              alt={"Username: " + session?.user?.name}
              src={session?.user?.image ?? undefined}
              className="object-fit rounded-full"
              height={24}
              width={24}
            />
            {session?.user?.name}
            <ChevronDown className="ml-auto" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          className="w-[--radix-popper-anchor-width]"
        >
          <DropdownMenuItem asChild>
            <Link
              href="/profile"
              className="flex w-full cursor-pointer flex-row"
            >
              <User />
              <div className="shrink">Profile</div>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button
              onClick={handleSignOut}
              className="flex w-full cursor-pointer flex-row"
            >
              <LogOut />
              Sign out
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );

  const signInButton = (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <button
          onClick={handleSignIn}
          className="flex w-full items-center justify-center gap-2 bg-[#5865F2] transition-all duration-200 ease-in-out hover:bg-[#8891f2]"
        >
          {/* Uncomment and use this icon if needed */}
          {/* <PowerIcon className="w-6" /> */}
          <Image
            src="/img/discord-mark-white.svg"
            alt="Discord"
            height={24}
            width={24}
          />
          <span className="text-secondary-foreground">
            Sign in with Discord
          </span>
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return <SidebarMenu>{session ? userMenu : signInButton}</SidebarMenu>;
}
