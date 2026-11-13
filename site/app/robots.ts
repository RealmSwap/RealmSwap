import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

// Hosted status links (/s/<code>) are capability URLs — anyone holding the
// link can read who's online — so they stay out of search engines entirely.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/s/", "/api/", "/download"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
