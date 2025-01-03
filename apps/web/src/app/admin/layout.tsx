import { redirect } from 'next/navigation';
import { auth } from "~/server/auth";

export default async function AdminLayout({
                                     children,
                                   }: Readonly<{ children: React.ReactNode }>) {

  const session = await auth();

  if(!session?.user?.isAdmin) {
    redirect('/');
  }

  return children;
}