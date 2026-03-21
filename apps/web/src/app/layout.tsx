import "~/app/globals.css";

import { type Metadata } from "next";

import { TRPCReactProvider } from "~/trpc/react";

import { ThemeProvider } from "~/components/ui/theme-provider";
import { GeistSans } from "geist/font/sans";
import { Manrope } from "next/font/google";
import { AppHeader } from "~/components/nav/app-header";
import { Toaster } from "~/components/ui/toaster";
import { TooltipProvider } from "~/components/ui/tooltip";
import { PostHogProvider } from "~/app/providers";
import { SessionProvider } from "next-auth/react";
import { BreadcrumbProvider } from "~/components/nav/breadcrumb-context";
import { GlobalQuickLauncher } from "~/components/ui/global-quick-launcher";
import { GlobalQuickLauncherProvider } from "~/contexts/global-quick-launcher-context";
import { siteConfig } from "~/lib/site-metadata";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
  title: {
    default: siteConfig.name,
    template: `${siteConfig.name} | %s`,
  },
  description: siteConfig.description,
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
    images: [
      {
        url: siteConfig.ogImage,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
  },
  icons: [{ rel: "icon", url: "/favicon/favicon.ico" }],
};

const displayFont = Manrope({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-display",
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.className} ${displayFont.variable} dark`}
      suppressHydrationWarning={true}
    >
      <body className="min-h-svh bg-background text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          <TRPCReactProvider>
            <SessionProvider basePath="/login">
              <PostHogProvider>
                <TooltipProvider>
                  <BreadcrumbProvider>
                    <GlobalQuickLauncherProvider>
                      <div className="relative min-h-svh overflow-hidden">
                        <div className="pointer-events-none absolute inset-0">
                          <div className="absolute inset-0 bg-[linear-gradient(rgba(170,180,176,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(170,180,176,0.018)_1px,transparent_1px)] bg-[size:48px_48px]" />
                          <div className="absolute inset-x-0 top-0 h-[22rem] bg-[radial-gradient(circle_at_top,rgba(214,138,73,0.08),rgba(214,138,73,0)_58%)]" />
                          <div className="absolute left-[-8rem] top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(92,92,102,0.07),rgba(92,92,102,0))]" />
                          <div className="absolute right-[-10rem] top-14 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(210,168,110,0.04),rgba(210,168,110,0))]" />
                        </div>
                        <div className="relative z-10 flex min-h-svh flex-col">
                          <AppHeader />
                          <div className="flex-1 overflow-y-auto overflow-x-hidden">
                            <div className="mx-auto w-full max-w-[1360px] px-4 pb-8 pt-4 sm:px-5 lg:px-8">
                              {children}
                            </div>
                          </div>
                        </div>
                        <Toaster duration={5000} />
                        <GlobalQuickLauncher />
                      </div>
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
