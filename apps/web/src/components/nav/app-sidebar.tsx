import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  ChartBarSquareIcon,
  MapIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { auth } from "~/server/auth";
import { AppSidebarLogin } from "~/components/nav/app-sidebar-login";
import Image from "next/image";
import {
  FilePlus,
  Users,
  ListRestart,
  ShieldCheck,
  Wand,
  ScanLine,
  ClipboardList,
  ServerCog,
} from "lucide-react";
import { SidebarSearchBox } from "~/components/nav/sidebar-search-box";

const coreItems = [
  { title: "Dashboard", url: "/", icon: ChartBarSquareIcon },
  { title: "Raids", url: "/raids", icon: MapIcon },
  { title: "Raiding characters", url: "/characters", icon: UserGroupIcon },
  { title: "Rare recipes & crafters", url: "/rare-recipes", icon: Wand },
];

const reportsSectionTitle = "Reports";
const reportsLinks = [
  {
    title: "Side-by-side attendance",
    url: "/reports/attendance",
    icon: ClipboardList,
  },
];

const raidManagerTitle = "Raid Manager";
const raidManagerLinks = [
  { title: "Create new raid", url: "/raids/new", icon: FilePlus },
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
  {
    title: "SoftRes Scan",
    url: "/softres",
    icon: ScanLine,
  },
  {
    title: "MRT Raid Group Fix",
    url: "/raid-manager/mrt-raid-group-fix",
    icon: ServerCog,
  },
];

const adminSectionTitle = "Admin Panel";
const adminLinks = [
  {
    title: "User permissions",
    url: "/admin/user-management",
    icon: ShieldCheck,
  },
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
            <div className="overflow-hidden whitespace-nowrap px-1 py-0.5 text-center font-bold group-data-[collapsible=icon]:hidden">
              TempleAshkandi.com
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="py-0">
          <SidebarGroupContent className="py-0 pt-2">
            <AppSidebarLogin session={session} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-0">
          <SidebarGroupContent className="py-0">
            <div className="pb-2">
              <SidebarSearchBox />
            </div>
            <SidebarMenu>
              {coreItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-0">
          <SidebarGroupLabel className="py-0">
            {reportsSectionTitle}
          </SidebarGroupLabel>
          <SidebarGroupContent className="py-0">
            <SidebarMenu>
              {reportsLinks.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {session?.user?.isRaidManager && (
          <SidebarGroup className="py-0">
            <SidebarGroupLabel className="py-0">
              {raidManagerTitle}
            </SidebarGroupLabel>
            <SidebarGroupContent className="py-0">
              <SidebarMenu>
                {raidManagerLinks.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link href={item.url}>
                        <item.icon />
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
          <SidebarGroup className="py-0">
            <SidebarGroupLabel className="py-0">
              {adminSectionTitle}
            </SidebarGroupLabel>
            <SidebarGroupContent className="py-0">
              <SidebarMenu>
                {adminLinks.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link href={item.url}>
                        <item.icon />
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
    </Sidebar>
  );
}
