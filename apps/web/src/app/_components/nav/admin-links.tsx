"use client";

import {
  WrenchScrewdriverIcon,
  ArrowDownTrayIcon
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

// Map of links to display in the side navigation.
// Depending on the size of the application, this would be stored in a database.
const links = [
  { name: "Admin Tools", href: "/admin", icon: WrenchScrewdriverIcon },
  { name: "Log Import", href: "/admin/logimport", icon: ArrowDownTrayIcon },
];

export default function AdminLinks() {
  const pathname = usePathname();

  return (
    <>
      {links.map((link) => {
        const LinkIcon = link.icon;
        return (
          <Link
            key={link.name}
            href={link.href}
            className={clsx(
              "flex h-[48px] grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-green-100 hover:text-green-900 md:flex-none md:justify-start md:p-2 md:px-3",
              {
                "bg-green-50 text-green-700": pathname === link.href,
              },
            )}
          >
            <LinkIcon className="w-6" />
            <p className="hidden md:block">{link.name}</p>
          </Link>
        );
      })}
    </>
  );
}
