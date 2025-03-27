"use client"

import { Construction } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import type {ReactNode} from "react";

export const ConstructionBanner = ({children}: {children: ReactNode}) => {
  return (
    <Card className="bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700">
      <CardContent className="py-2 px-4 flex items-center space-x-2">
        <Construction className="w-5 h-5 text-yellow-800 dark:text-yellow-200" />
        <span className="text-xs text-yellow-800 dark:text-yellow-200">
          {children ?? 'Page in development. More features coming soon.'}
        </span>
      </CardContent>
    </Card>
  );
};