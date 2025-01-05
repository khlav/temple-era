import "~/app/ui/globals.css";

import { type Metadata } from "next";

import { TRPCReactProvider } from "~/trpc/react";

import SideNav from "~/app/_components/nav/sidenav";

export const metadata: Metadata = {
  title: "Temple Raid Attendance",
  icons: [{ rel: "icon", url: "/favicon/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="">
      <body>
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
      </body>
    </html>
  );
}
