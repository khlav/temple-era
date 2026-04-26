"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { useToast } from "~/hooks/use-toast";

export function ApiAccessCard() {
  const { toast } = useToast();
  const utils = api.useUtils();

  const { data: profile, isLoading } = api.profile.getMyProfile.useQuery();

  const [newToken, setNewToken] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    "regenerate" | "revoke" | null
  >(null);

  const generateToken = api.profile.generateApiToken.useMutation({
    onSuccess: (data) => {
      setNewToken(data.token);
      setConfirmAction(null);
      void utils.profile.getMyProfile.invalidate();
      toast({
        title: data.replaced ? "Token regenerated" : "Token generated",
        description: "Copy your token — it won't be shown again.",
      });
    },
    onError: (err) => {
      toast({
        title: "Failed to generate token",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const revokeToken = api.profile.revokeApiToken.useMutation({
    onSuccess: () => {
      setNewToken(null);
      setConfirmAction(null);
      void utils.profile.getMyProfile.invalidate();
      toast({ title: "Token revoked" });
    },
    onError: (err) => {
      toast({
        title: "Failed to revoke token",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleCopy = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      toast({ title: "Token copied to clipboard" });
    } catch {
      toast({
        title: "Could not copy token",
        description: "Please copy it manually.",
        variant: "destructive",
      });
    }
  };

  const handleDismissToken = () => {
    setNewToken(null);
  };

  // Don't render until we know the user's role
  if (isLoading || !profile) return null;

  const { isRaidManager, isAdmin, hasApiToken } = profile;

  // Only show for raid managers and admins
  if (!isRaidManager && !isAdmin) return null;

  const isPending = generateToken.isPending || revokeToken.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          API Access
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Status */}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-muted-foreground">Status:</span>
          {hasApiToken || newToken ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Active
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
              No token
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {!hasApiToken && !newToken ? (
            // No token — show Generate
            <Button
              size="sm"
              onClick={() => generateToken.mutate()}
              disabled={isPending}
            >
              Generate Token
            </Button>
          ) : (
            <>
              {/* Regenerate */}
              {confirmAction === "regenerate" ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Replace existing token?
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => generateToken.mutate()}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => setConfirmAction(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : confirmAction === "revoke" ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Revoke token?
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => revokeToken.mutate()}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => setConfirmAction(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => setConfirmAction("regenerate")}
                  >
                    Regenerate
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={isPending}
                    onClick={() => setConfirmAction("revoke")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Revoke
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        {/* New token display — shown once */}
        {newToken && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1 font-mono text-sm">
                {newToken}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => void handleCopy()}
                title="Copy to clipboard"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Save this token — it won&apos;t be shown again.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="self-start text-xs text-muted-foreground"
              onClick={handleDismissToken}
            >
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
