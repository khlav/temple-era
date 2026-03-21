import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.temple-era.com";

export const siteConfig = {
  name: "Temple",
  description:
    "Raid attendance, raid planning, and roster tools for Temple on WoW Classic Era.",
  url: siteUrl,
  ogImage: "/img/temple_512.jpeg",
};

export const noIndexRobots: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  noarchive: true,
  nosnippet: true,
};

interface CreatePageMetadataOptions {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  type?: "website" | "article" | "profile";
}

export function createPageMetadata({
  title,
  description = siteConfig.description,
  path,
  image = siteConfig.ogImage,
  noIndex = false,
  type = "website",
}: CreatePageMetadataOptions = {}): Metadata {
  const pageTitle = title ?? siteConfig.name;
  const socialTitle =
    pageTitle === siteConfig.name
      ? pageTitle
      : `${siteConfig.name} | ${pageTitle}`;
  const url = path ? `${siteConfig.url}${path}` : siteConfig.url;

  return {
    title:
      pageTitle === siteConfig.name ? { absolute: siteConfig.name } : pageTitle,
    description,
    ...(path
      ? {
          alternates: {
            canonical: path,
          },
        }
      : {}),
    ...(noIndex ? { robots: noIndexRobots } : {}),
    openGraph: {
      title: socialTitle,
      description,
      url,
      siteName: siteConfig.name,
      type,
      images: [
        {
          url: image,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [image],
    },
  };
}
