import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { type Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function RaidManagerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  if (!session?.user?.isRaidManager) {
    redirect("/");
  }

  return children;
}
