import type { toast as toastType } from "~/hooks/use-toast";
import { Check } from "lucide-react";
import { ToastAction } from "@radix-ui/react-toast";
import { Button } from "~/components/ui/button";
import Link from "next/link";

export const toastProfileSaved = (toast: typeof toastType) => {
  toast({
    // @ts-expect-error Accepts <Element> just fine.  Ignore type safety concern.
    title: (
      <>
        <Check className="inline-block pr-1 text-emerald-700" />
        <span>Profile saved</span>
      </>
    ),
    action: (
      <ToastAction asChild altText="Go">
        <Button size="sm" asChild>
          <Link href="/">Go to Dashboard</Link>
        </Button>
      </ToastAction>
    ),
  });
};
