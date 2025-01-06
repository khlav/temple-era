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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
          <BreadcrumbItem key="home">
            <BreadcrumbLink asChild>
              <Link href="/">
                <ChartBarSquareIcon width={20} height={20} />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {parentPathParts.map((part, i) => (
            <>
              <BreadcrumbSeparator className="hidden md:block" key={`sep_${i}`}/>
              <BreadcrumbItem className="hidden md:block" key={part+i.toString()}>
                <BreadcrumbLink asChild>
                  <Link href={"/" + pathParts.slice(0, i + 1).join("/")}>
                    {capitalize(part)}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          ))}
          {currentPathPart ? (
            <>
              <BreadcrumbSeparator key={`sep_current`}/>
              <BreadcrumbItem key={currentPathPart}>
                <BreadcrumbPage>{capitalize(currentPathPart)}</BreadcrumbPage>
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
