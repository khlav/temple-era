import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export const SearchHelperText = () => {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div className="flex cursor-help items-center gap-1 text-xs text-muted-foreground">
          <InfoIcon size={12} />
          <span>Search tips</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs bg-muted p-3 text-xs text-muted-foreground">
        <p className="mb-1 font-medium">Search tips:</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>Type multiple terms to find recipes matching ALL terms</li>
          <li>
            Use <span className="font-mono text-chart-3">#tag</span> to search
            by tag
          </li>
          <li>
            Use <span className="font-mono text-chart-3">-term</span> to exclude
            results (e.g.{" "}
            <span className="font-mono text-chart-3">-leather</span> excludes
            leather items)
          </li>
          <li>Click on tags or crafter names to add them to your search</li>
        </ul>
      </TooltipContent>
    </Tooltip>
  );
};
