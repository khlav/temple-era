import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";

const errorMessages = {
  AccessDenied: {
    title: "Access denied",
    message:
      "Discord did not approve the sign-in request. Try again and make sure you complete the authorization flow.",
  },
  CallbackRouteError: {
    title: "Discord sign-in failed",
    message:
      "The callback from Discord did not complete successfully. Wait a bit and then try signing in again.",
  },
  Configuration: {
    title: "Discord is temporarily rate-limiting sign-in",
    message:
      "Discord refused the token exchange after authorization. This usually clears after a short wait. Avoid repeated retries for a few minutes, then try again.",
  },
  Default: {
    title: "Unable to sign in",
    message:
      "The sign-in flow did not complete. Wait a moment and try again. If it keeps happening, check the server logs for the provider error details.",
  },
} as const;

export default async function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const content = error
    ? (errorMessages[error as keyof typeof errorMessages] ??
      errorMessages.Default)
    : errorMessages.Default;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{content.title}</CardTitle>
          <CardDescription>{content.message}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/">Return Home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login/signin">Try Again</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
