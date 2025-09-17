// app/providers.js

"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react"; // Add this import

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type ReactNode } from "react";
import { posthogSafe } from "~/utils/posthog";

export const PostHogIdentify = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSignIn = searchParams.get("signin") === "1";
  const { data: session, status } = useSession(); // Get session client-side
  const sessionLoaded = status === "authenticated";

  // Handle identification once PostHog and session are ready
  useEffect(() => {
    if (
      posthogSafe.isReady() &&
      isSignIn &&
      sessionLoaded &&
      session?.user?.id
    ) {
      // Identify sends an event, so you want may want to limit how often you call it
      posthogSafe.identify(session.user.id, {
        name: session.user.name,
        isRaidManager: session.user.isRaidManager,
        isAdmin: session.user.isAdmin,
      });

      router.replace("/", { scroll: false });
      console.log(`Welcome, ${session.user.name}!`);
    }
  }, [router, isSignIn, session, sessionLoaded]);

  return null;
};

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Track pageviews
  useEffect(() => {
    if (pathname && posthogSafe.isReady()) {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = url + `?${searchParams.toString()}`;
      }

      posthogSafe.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams]);

  return null;
}

// Wrap this in Suspense to avoid the `useSearchParams` usage above
// from de-opting the whole app into client-side rendering
export default function SuspendedPostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  );
}

function SuspendedPostHogIdentify() {
  return (
    <Suspense fallback={null}>
      <PostHogIdentify />
    </Suspense>
  );
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize PostHog only if enabled
    posthogSafe.init(process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "", {
      api_host: "/e",
      ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? null,
      person_profiles: "identified_only",
      capture_pageview: false, // Disable automatic pageview capture, as we capture manually
      capture_pageleave: true, // Enable pageleave capture
      loaded: function () {
        setIsInitialized(true);
      },
    });

    if (
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1"
    ) {
      posthogSafe.debug();
    }
  }, []);

  return (
    <PHProvider client={posthog}>
      {isInitialized && <SuspendedPostHogIdentify />}
      {children}
      <SuspendedPostHogPageView />
    </PHProvider>
  );
}
