import posthog from "posthog-js";
import { env } from "~/env.js";
import type { Properties, PostHogConfig } from "posthog-js";

const isPostHogEnabled = () => env.NEXT_PUBLIC_POSTHOG_ENABLED;

export const posthogSafe = {
  identify: (userId: string, properties?: Properties) => {
    if (isPostHogEnabled() && posthog.__loaded) {
      posthog.identify(userId, properties);
    }
  },
  capture: (event: string, properties?: Properties) => {
    if (isPostHogEnabled() && posthog.__loaded) {
      posthog.capture(event, properties);
    }
  },
  reset: () => {
    if (isPostHogEnabled() && posthog.__loaded) {
      posthog.reset();
    }
  },
  isReady: () => isPostHogEnabled() && posthog.__loaded,
  init: (key: string, config?: Partial<PostHogConfig>) => {
    if (isPostHogEnabled()) {
      posthog.init(key, config);
    }
  },
  debug: () => {
    if (isPostHogEnabled()) {
      posthog.debug();
    }
  },
};
