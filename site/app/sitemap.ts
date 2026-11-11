import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { getPublicRealms } from "@/lib/backend/realms";

// The marketing surfaces plus every realm's public landing page. Status
// capability links are excluded (robots.txt disallows /s/ entirely).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/realms`, changeFrequency: "daily", priority: 0.9 },
  ];

  const { realms } = await getPublicRealms(1000);
  return [
    ...staticRoutes,
    ...realms.map((realm) => ({
      url: `${SITE_URL}/r/${realm.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
