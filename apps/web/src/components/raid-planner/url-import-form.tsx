"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";
import { Loader2 } from "lucide-react";

interface UrlImportFormProps {
  onEventSelect: (eventId: string) => void;
  onSuccess?: () => void;
}

export function UrlImportForm({
  onEventSelect,
  onSuccess,
}: UrlImportFormProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const utils = api.useUtils();

  const extractEventId = (urlStr: string): string | null => {
    const match = urlStr.match(/raid-helper\.dev\/(?:raidplan|event)\/(\d+)/);
    return match?.[1] ?? null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError("Please enter a Raid-Helper URL");
      return;
    }

    const eventId = extractEventId(url);
    if (!eventId) {
      setError(
        "Invalid URL. Expected: raid-helper.dev/raidplan/{id} or raid-helper.dev/event/{id}",
      );
      return;
    }

    setIsLoading(true);
    try {
      // Validate the event exists
      await utils.raidHelper.getEventDetails.fetch({ eventId });
      // Open the dialog with the validated event
      onEventSelect(eventId);
      onSuccess?.();
      setUrl(""); // Clear input on success
    } catch (err) {
      setError("Failed to fetch event. Please check the URL and try again.");
      console.error("Failed to import:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            id="raid-helper-url"
            type="url"
            placeholder="https://raid-helper.dev/raidplan/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={error ? "border-red-500" : ""}
            autoComplete="off"
            autoFocus
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Import"
            )}
          </Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Paste a raid-helper.dev/raidplan or raid-helper.dev/event URL
        </p>
      </div>
    </form>
  );
}
