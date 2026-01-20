"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent } from "~/components/ui/card";

export function SoftResScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const extractRaidId = (url: string): string | null => {
    // Match patterns like:
    // https://softres.it/raid/xtkwta
    // https://softres.it/raid/xtkwta/
    // softres.it/raid/xtkwta
    const match = url.match(/softres\.it\/raid\/([a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError("Please enter a SoftRes URL");
      return;
    }

    const raidId = extractRaidId(url);
    if (!raidId) {
      setError(
        "Invalid SoftRes URL. Expected format: https://softres.it/raid/[id]",
      );
      return;
    }

    router.push(`/softres/${raidId}`);
  };

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-2">
          <Label htmlFor="softres-url">SoftRes URL</Label>
          <div className="flex gap-2">
            <Input
              id="softres-url"
              type="url"
              placeholder="https://softres.it/raid/xtkwta"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={error ? "border-red-500" : ""}
              autoComplete="off"
            />
            <Button type="submit">Scan</Button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
