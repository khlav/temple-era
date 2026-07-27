import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  className?: string;
  variant?: "compact" | "hero";
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  meta,
  className,
  variant = "compact",
}: PageHeaderProps) {
  const isHero = variant === "hero";

  return (
    <div
      className={cn(
        isHero
          ? "panel-surface relative overflow-hidden rounded-[28px] border border-border/80 px-5 py-5 sm:px-7 sm:py-6"
          : "px-0 py-1",
        className,
      )}
    >
      {isHero ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(214,138,73,0.11),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.02),transparent_42%)]" />
      ) : null}
      <div
        className={cn(
          "relative z-10 flex flex-col gap-3",
          isHero
            ? "sm:flex-row sm:items-end sm:justify-between"
            : "sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        )}
      >
        <div className="min-w-0 space-y-1">
          {eyebrow ? (
            <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-primary/80">
              {eyebrow}
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:gap-3">
            <h1
              className={cn(
                "font-display min-w-0 text-balance tracking-tight text-foreground",
                isHero
                  ? "text-3xl font-bold sm:text-5xl"
                  : "text-[1.6rem] font-semibold sm:text-[1.75rem]",
              )}
            >
              {title}
            </h1>
            {meta ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {meta}
              </div>
            ) : null}
          </div>
          {description ? (
            <p
              className={cn(
                "max-w-3xl text-muted-foreground",
                isHero ? "pt-1 text-sm sm:text-base" : "text-sm leading-5",
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            className={cn(
              "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end",
              isHero ? "sm:self-start" : "",
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
