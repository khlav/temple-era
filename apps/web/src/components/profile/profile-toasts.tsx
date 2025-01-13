import type { toast as toastType } from "~/hooks/use-toast";
import { Check } from "lucide-react";

export const toastProfileSaved = (
  toast: typeof toastType,
) => {
  toast({
    // @ts-expect-error Accepts <Element> just fine.  Ignore type safety concern.
    title: (
      <>
        <Check className="inline-block pr-1 text-emerald-700" />
        <span>Profile saved</span>
      </>
    ),
  });
};
