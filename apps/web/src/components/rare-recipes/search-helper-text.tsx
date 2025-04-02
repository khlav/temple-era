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
        <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
          <InfoIcon size={12} />
          <span>Search tips</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs p-3 bg-muted text-muted-foreground">
        <p className="font-medium mb-1">Search tips:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Type multiple terms to find recipes matching ALL terms</li>
          <li>Use <span className="font-mono bg-gray-600 px-1 rounded">#tag</span> to search by tag</li>
          <li>Use <span className="font-mono bg-gray-600 px-1 rounded">-term</span> to exclude results (e.g. <span className="font-mono bg-gray-600 px-1 rounded">-leather</span> excludes leather items)</li>
          <li>Click on tags or crafter names to add them to your search</li>
        </ul>
      </TooltipContent>
    </Tooltip>
  );
};