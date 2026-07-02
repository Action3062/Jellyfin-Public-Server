import type { MetadataRoute } from "next";

// Makes the portal (and especially /admin) installable as a phone home-screen
// app. Icons are intentionally omitted to avoid shipping binary assets; the
// browser falls back to the page favicon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BYTEFLIX Admin",
    short_name: "BYTEFLIX",
    description: "Verwaltung & Zahlungen",
    start_url: "/admin",
    display: "standalone",
    background_color: "#08080b",
    theme_color: "#08080b",
    orientation: "portrait"
  };
}
