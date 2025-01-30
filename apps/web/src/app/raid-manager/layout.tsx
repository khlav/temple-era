import { redirect } from 'next/navigation';
import { auth } from "~/server/auth";

export default async function RaidManagerLayout({
                                            children,
                                          }: Readonly<{ children: React.ReactNode }>) {

  const session = await auth();

  if(!session?.user?.isRaidManager) {
    redirect('/');
  }

  return children;
}