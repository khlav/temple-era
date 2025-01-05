import Link from "next/link";
import NavLinks from "~/app/_components/nav/nav-links";
import AdminLinks from "~/app/_components/nav/admin-links";
import UserAvatar from "~/app/_components/nav/user-avatar";

import { PowerIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import { auth } from "~/server/auth";

export default async function SideNav() {
  const session = await auth();

  return (
    <>
      <div className="flex h-full flex-col px-3 py-4 md:px-2">
        <div className="mb-2 flex h-20  items-end justify-start rounded-md bg-[url('/img/temple_512.jpeg')] bg-cover bg-center md:bg-top md:h-56" />

        <div className="flex grow flex-row justify-between space-x-2 md:flex-col md:space-x-0 md:space-y-2">
          <NavLinks />
          <div className="hidden h-auto w-full grow rounded-md bg-gray-50 md:block"></div>
          { session &&
              <div className="flex h-[48px] grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium md:flex-none md:justify-start md:p-2 md:px-3">
                <UserAvatar
                  name={session.user.name ?? ""}
                  image={session.user.image ?? ""}
                  extraInfo={session.user.isAdmin ? "Admin" : undefined}
                />
              </div>
          }
          {
            session?.user?.isAdmin &&
              <AdminLinks />
          }
          <Link
            href={session ? "/api/auth/signout" : "/api/auth/signin"}
            className="flex h-[48px] grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-gray-200 hover:text-green-800 md:flex-none md:justify-start md:p-2 md:px-3"
          >
            {session ? (
              <PowerIcon className="w-6" />
            ) : (
              <UserCircleIcon className="w-6" />
            )}
            <p className="hidden md:block">{session ? "Sign out" : "Sign in"}</p>
          </Link>
        </div>
      </div>
    </>
  );
}
