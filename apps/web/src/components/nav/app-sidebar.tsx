import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {ModeToggle} from "@/components/ui/mode-toggle";

import {
  ChartBarSquareIcon,
  MapIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import {auth} from "~/server/auth";
import {AppSidebarLogin} from "~/components/nav/app-sidebar-login";
import Image from "next/image";
import {FilePlus, Users, ListRestart, ShieldCheck, Wand} from "lucide-react";

const coreItems = [
  {title: "Dashboard", url: "/", icon: ChartBarSquareIcon},
  {title: "Raids", url: "/raids", icon: MapIcon},
  {title: "Raiding characters", url: "/characters", icon: UserGroupIcon},
  {title: "Rare recipes & crafters", url: "/rare-recipes", icon: Wand},

];

const raidManagerTitle = "Raid Manager";
const raidManagerLinks = [
  {title: "Create new raid", url: "/raids/new", icon: FilePlus},
  {
    title: "Manage mains v. alts",
    url: "/raid-manager/characters",
    icon: Users,
  },
  {
    title: "Refresh WCL log",
    url: "/raid-manager/log-refresh",
    icon: ListRestart,
  },
];

const adminSectionTitle = "Admin Panel";
const adminLinks = [
  {
    title: "User permissions",
    url: "/admin/user-management",
    icon: ShieldCheck,
  }
];

export async function AppSidebar({
                                   ...props
                                 }: React.ComponentProps<typeof Sidebar>) {
  const session = await auth();

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Image
              src="/img/temple_256.jpeg"
              width={512}
              height={512}
              alt={"Temple"}
              className="rounded-xl"
              priority
            />
            <div
              className="overflow-hidden whitespace-nowrap px-1 py-2 text-center font-bold group-data-[collapsible=icon]:hidden">
              TempleAshkandi.com
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <AppSidebarLogin session={session}/>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {coreItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
                      <item.icon/>
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {session?.user?.isRaidManager && (
          <SidebarGroup>
            <SidebarGroupLabel>{raidManagerTitle}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {raidManagerLinks.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link href={item.url}>
                        <item.icon/>
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {session?.user?.isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{adminSectionTitle}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminLinks.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link href={item.url}>
                        <item.icon/>
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="m-auto">
          <ModeToggle/>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
