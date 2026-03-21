"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  Menu,
  LogOut,
  ShieldCheck,
  Settings2,
  ScanLine,
  Search,
  User,
  Users,
  DraftingCompass,
  FilePlus,
  ListRestart,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  SheetClose,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { useGlobalQuickLauncher } from "~/contexts/global-quick-launcher-context";

const primaryNav = [
  { label: "Dashboard", href: "/" },
  { label: "Raids", href: "/raids" },
  { label: "Raid Plans", href: "/raid-plans" },
  { label: "Characters", href: "/characters" },
  { label: "Recipes", href: "/rare-recipes" },
  { label: "Reports", href: "/reports/attendance" },
];

const managerNav = [
  { label: "Create raid", href: "/raids/new", icon: FilePlus },
  {
    label: "Raid planner",
    href: "/raid-manager/raid-planner",
    icon: DraftingCompass,
  },
  {
    label: "Manage mains/alts",
    href: "/raid-manager/characters",
    icon: Users,
  },
  {
    label: "Refresh WCL log",
    href: "/raid-manager/log-refresh",
    icon: ListRestart,
  },
  { label: "SoftRes scan", href: "/softres", icon: ScanLine },
];

const adminNav = [
  {
    label: "User permissions",
    href: "/admin/user-management",
    icon: ShieldCheck,
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const AppHeader = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { setOpen } = useGlobalQuickLauncher();

  const utilityLinks = useMemo(
    () => [
      ...(session?.user?.isRaidManager ? managerNav : []),
      ...(session?.user?.isAdmin ? adminNav : []),
    ],
    [session?.user?.isAdmin, session?.user?.isRaidManager],
  );

  const handleSignIn = () =>
    signIn("discord", {
      redirectTo: window.location.pathname + "?signin=1",
    });

  const handleSignOut = () => {
    void signOut();
  };

  useEffect(() => {
    for (const item of primaryNav) {
      router.prefetch(item.href);
    }

    for (const item of utilityLinks) {
      router.prefetch(item.href);
    }
  }, [router, utilityLinks]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1360px] items-center gap-3 px-4 py-3 sm:px-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="group flex items-center gap-3 rounded-xl px-1 py-1 transition-opacity hover:opacity-90"
          >
            <div className="relative h-10 w-10 overflow-hidden rounded-xl ring-1 ring-border/80 transition-colors group-hover:ring-primary/35">
              <Image
                src="/img/temple_256.jpeg"
                alt="Temple emblem"
                fill
                className="object-cover opacity-90"
                sizes="40px"
                priority
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(156,197,166,0.18),transparent_55%)]" />
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="font-display text-lg font-bold tracking-tight text-foreground">
                Temple
              </div>
              <div className="text-[11px] uppercase leading-[1.15] tracking-[0.12em] text-muted-foreground">
                <div>Classic Era</div>
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {primaryNav.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                className="hidden min-w-[108px] justify-center gap-2 lg:inline-flex"
              >
                <Search className="h-4 w-4" />
                Search
              </Button>
            </TooltipTrigger>
            <TooltipContent>Cmd/Ctrl + K</TooltipContent>
          </Tooltip>

          {utilityLinks.length > 0 ? (
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden md:inline-flex"
                >
                  <Settings2 className="h-4 w-4" />
                  Guild Tools
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-full border-l-border/70 bg-card/95 sm:max-w-md"
              >
                <SheetHeader>
                  <SheetTitle className="font-display text-2xl tracking-tight">
                    Guild Tools
                  </SheetTitle>
                  <SheetDescription>
                    Manager and Site Admin tools.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  {session?.user?.isRaidManager ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Raid Manager</Badge>
                      </div>
                      <div className="grid gap-2">
                        {managerNav.map((item) => (
                          <SheetClose asChild key={item.href}>
                            <Link
                              href={item.href}
                              className="panel-subtle flex items-center gap-3 rounded-2xl border border-border/70 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
                            >
                              <item.icon className="h-4 w-4 text-primary" />
                              <span>{item.label}</span>
                            </Link>
                          </SheetClose>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {session?.user?.isAdmin ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Admin</Badge>
                      </div>
                      <div className="grid gap-2">
                        {adminNav.map((item) => (
                          <SheetClose asChild key={item.href}>
                            <Link
                              href={item.href}
                              className="panel-subtle flex items-center gap-3 rounded-2xl border border-border/70 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
                            >
                              <item.icon className="h-4 w-4 text-primary" />
                              <span>{item.label}</span>
                            </Link>
                          </SheetClose>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </SheetContent>
            </Sheet>
          ) : null}

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-full border-r-border/70 bg-card/95 sm:max-w-sm"
            >
              <SheetHeader>
                <SheetTitle className="font-display text-2xl tracking-tight">
                  Temple
                </SheetTitle>
                <SheetDescription>Classic Era</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="grid gap-2">
                  {primaryNav.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    return (
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-sm font-medium transition-colors",
                            active
                              ? "bg-primary/12 border-primary/30 text-primary"
                              : "border-border/70 bg-card/40 text-muted-foreground hover:border-primary/25 hover:text-foreground",
                          )}
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    );
                  })}
                </div>
                {utilityLinks.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Guild Tools</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Manager and Site Admin tools.
                    </div>
                    <div className="grid gap-2">
                      {utilityLinks.map((item) => (
                        <SheetClose asChild key={item.href}>
                          <Link
                            href={item.href}
                            className="panel-subtle flex items-center gap-3 rounded-2xl border border-border/70 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
                          >
                            <item.icon className="h-4 w-4 text-primary" />
                            <span>{item.label}</span>
                          </Link>
                        </SheetClose>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>

          {session?.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 gap-2 rounded-xl border border-border/70 bg-card/65 px-2"
                >
                  <Avatar className="h-7 w-7 border border-border/70">
                    <AvatarImage
                      src={session.user.image ?? undefined}
                      alt={session.user.name ?? "Temple user"}
                    />
                    <AvatarFallback>
                      {session.user.name?.[0] ?? "T"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[120px] truncate sm:inline-block">
                    {session.user.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-2xl border-border/75 bg-popover/95 p-2 backdrop-blur"
              >
                <DropdownMenuLabel className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Account
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              onClick={handleSignIn}
              className="bg-[#5865F2] text-white hover:bg-[#6f79f7]"
            >
              <Image
                src="/img/discord-mark-white.svg"
                alt="Discord"
                width={16}
                height={16}
              />
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
