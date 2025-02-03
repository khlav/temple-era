// app/providers.js

"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type ReactNode, useEffect } from "react";

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "", {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      person_profiles: "identified_only",
      capture_pageview: false, // Disable automatic pageview capture, as we capture manually
    });
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      posthog.opt_out_capturing();
    }
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
