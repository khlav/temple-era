"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { useSpellIcon, getSpellIconUrl } from "~/hooks/use-spell-icon";

/** Recipe/spell icon fetched from Wowhead, mirroring SoftResItemIcon's loading pattern. */
export function SpellIcon({ spellId, size = 18 }: { spellId: number; size?: number }) {
  const { icon, loading } = useSpellIcon(spellId);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgErrored, setImgErrored] = useState(false);

  const showPlaceholder = loading || !icon || (!imgLoaded && !imgErrored);

  // Fetch a CDN tier at least as large as the render size so the browser downscales instead of
  // upscaling — upscaling a same-size or smaller source is what produced the blurry/pixelated
  // icons. small/medium/large are native 18/36/56px, so this never upscales at any of our sizes.
  const cdnSize = size <= 18 ? "small" : size <= 36 ? "medium" : "large";

  if (!loading && (!icon || imgErrored)) {
    return (
      <HelpCircle
        className="shrink-0 text-muted-foreground"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {showPlaceholder && (
        <HelpCircle
          className="absolute inset-0 text-muted-foreground"
          style={{ width: size, height: size }}
        />
      )}
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getSpellIconUrl(icon, cdnSize)}
          alt=""
          width={size}
          height={size}
          className={imgLoaded ? "rounded-sm" : "opacity-0"}
          style={{ width: size, height: size }}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgErrored(true)}
        />
      )}
    </span>
  );
}
