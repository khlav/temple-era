import "~/app/ui/globals.css";

import { inter } from "~/app/ui/fonts";
import { type Metadata } from "next";

import { Theme } from "@radix-ui/themes";

import { TRPCReactProvider } from "~/trpc/react";

import "@radix-ui/themes/styles.css";
import SideNav from "~/app/ui/nav/sidenav";

export const metadata: Metadata = {
  title: "Temple Raid Attendance",
  icons: [{ rel: "icon", url: "/favicon/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.className} antialiasing`}>
      <body>
        <Theme accentColor="jade" grayColor="slate">
          <TRPCReactProvider>
            <div className="flex h-screen flex-col md:flex-row md:overflow-hidden">
              <div className="w-full flex-none md:w-64">
                <SideNav />
              </div>
              <div className="flex-grow p-6 md:overflow-y-auto md:p-12">
                {children}
              </div>
            </div>
          </TRPCReactProvider>
        </Theme>
      </body>
    </html>
  );
}
