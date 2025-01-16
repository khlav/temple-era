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
import {ChartBarSquareIcon} from "@heroicons/react/24/outline";
import React from "react";


function kebabToTitleCase(str: string) {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const AppHeader = () => {
  const pathParts = usePathname().slice(1).split("/") ?? [];
  const parentPathParts = pathParts.slice(0, pathParts.length - 1) ?? [];
  const currentPathPart = pathParts.slice(-1)[0] ?? undefined;

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
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
                    {kebabToTitleCase(part)}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </React.Fragment >
          ))}
          {currentPathPart ? (
            <>
              <BreadcrumbSeparator/>
              <BreadcrumbItem key={currentPathPart}>
                <BreadcrumbPage>{kebabToTitleCase(currentPathPart)}</BreadcrumbPage>
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
