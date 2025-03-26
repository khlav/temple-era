"use client"

import Script from "next/script";

export const WOWHeadTooltips = () => {
  return (
    <>
      <Script id="wowhead-vars" strategy="lazyOnload">
        {`const whTooltips = {colorLinks: false, iconizeLinks: false, iconSize: 'tiny'};`}
      </Script>
      <Script id="wowhead" src="//wow.zamimg.com/js/tooltips.js" strategy="lazyOnload">
      </Script>
    </>
  )
}