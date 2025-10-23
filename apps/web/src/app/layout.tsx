import "~/app/globals.css";

import { type Metadata } from "next";

import { TRPCReactProvider } from "~/trpc/react";

import { ThemeProvider } from "~/components/ui/theme-provider";
import { AppSidebar } from "~/components/nav/app-sidebar";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { GeistSans } from "geist/font/sans";
import { cookies } from "next/headers";
import { AppHeader } from "~/components/nav/app-header";
import { Toaster } from "~/components/ui/toaster";
import { TooltipProvider } from "~/components/ui/tooltip";
import { PostHogProvider } from "~/app/providers";
import { SessionProvider } from "next-auth/react";
import { BreadcrumbProvider } from "~/components/nav/breadcrumb-context";
import { GlobalQuickLauncher } from "~/components/ui/global-quick-launcher";
import { GlobalQuickLauncherProvider } from "~/contexts/global-quick-launcher-context";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://www.templeashkandi.com",
  ),
  icons: [{ rel: "icon", url: "/favicon/favicon.ico" }],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const defaultOpen = !(cookieStore.get("sidebar:state")?.value === "false");

  return (
    <html
      lang="en"
      className={GeistSans.className}
      suppressHydrationWarning={true}
    >
      <body className="flex h-screen">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TRPCReactProvider>
            <SessionProvider>
              <PostHogProvider>
                <TooltipProvider>
                  <BreadcrumbProvider>
                    <GlobalQuickLauncherProvider>
                      <SidebarProvider defaultOpen={defaultOpen}>
                        <AppSidebar side="left" collapsible="icon" />
                        <SidebarInset className="flex flex-col">
                          <AppHeader />
                          <div className="flex-1 overflow-auto">
                            <div className="max-w-screen-xl md:p-4">
                              {children}
                            </div>
                          </div>
                        </SidebarInset>
                        <Toaster duration={5000} />
                        <GlobalQuickLauncher />
                      </SidebarProvider>
                    </GlobalQuickLauncherProvider>
                  </BreadcrumbProvider>
                </TooltipProvider>
              </PostHogProvider>
            </SessionProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
