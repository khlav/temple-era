"use client";

import { SidebarTrigger } from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChartBarSquareIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useMemo } from "react";
import { useBreadcrumb } from "./breadcrumb-context";

function kebabToTitleCase(str: string) {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const AppHeader = () => {
  const pathname = usePathname();
  const { breadcrumbData } = useBreadcrumb();

  const pathParts = useMemo(
    () => pathname.slice(1).split("/") ?? [],
    [pathname],
  );
  const parentPathParts = useMemo(
    () => pathParts.slice(0, pathParts.length - 1) ?? [],
    [pathParts],
  );
  const currentPathPart = useMemo(
    () => pathParts.slice(-1)[0] ?? undefined,
    [pathParts],
  );

  useEffect(() => {
    const titleParts = pathParts.map(
      (part) => breadcrumbData[part] || kebabToTitleCase(part),
    );

    document.title =
      "Temple Raid Attendance" +
      (pathParts[0] !== "" ? " - " + titleParts.join(" - ") : "");
  }, [currentPathPart, pathParts, breadcrumbData, pathname]);

  return (
    <header className="flex h-10 w-full max-w-screen-xl shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb className="flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">
                <ChartBarSquareIcon width={20} height={20} />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {parentPathParts.map((part, i) => (
            <React.Fragment key={`breadcrumb_${i}`}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={"/" + pathParts.slice(0, i + 1).join("/")}>
                    {breadcrumbData[part] || kebabToTitleCase(part)}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </React.Fragment>
          ))}
          {currentPathPart ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem key={currentPathPart}>
                <BreadcrumbPage>
                  {breadcrumbData[currentPathPart] ||
                    kebabToTitleCase(currentPathPart)}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            ""
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
};
