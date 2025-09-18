"use client";

import { Construction } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import type { ReactNode } from "react";

export const ConstructionBanner = ({ children }: { children: ReactNode }) => {
  return (
    <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/30">
      <CardContent className="flex items-center space-x-2 px-4 py-2">
        <Construction className="h-5 w-5 text-yellow-800 dark:text-yellow-200" />
        <span className="text-xs text-yellow-800 dark:text-yellow-200">
          {children ?? "Page in development. More features coming soon."}
        </span>
      </CardContent>
    </Card>
  );
};
