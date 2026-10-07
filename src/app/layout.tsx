import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FirebaseAnalytics } from "@/components/firebase-analytics";
import { JsonLd } from "@/components/json-ld";
import { SiteChrome } from "@/components/site-chrome";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { models } from "@/lib/catalog";
import { absoluteUrl, SITE } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${models.length} Free Rigged 3D Characters (GLB)`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: SITE.keywords,
  category: "technology",
  authors: [{ name: SITE.author }],
  creator: SITE.author,
  publisher: SITE.brand,
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { title: SITE.shortName, statusBarStyle: "black-translucent" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
};

export const viewport: Viewport = {
  themeColor: SITE.themeColor,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.brand,
  alternateName: SITE.shortName,
  url: absoluteUrl("/"),
  description: SITE.description,
  inLanguage: "en",
  creator: { "@type": "Person", name: SITE.author },
  publisher: { "@type": "Organization", name: SITE.brand, url: absoluteUrl("/"), logo: absoluteUrl("/icons/icon-512.png") },
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/models/")}?q={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <JsonLd data={websiteJsonLd} />
        <FirebaseAnalytics />
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-fg px-4 py-2 text-sm text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <SiteChrome>
          <SiteHeader />
        </SiteChrome>
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteChrome>
          <SiteFooter />
        </SiteChrome>
      </body>
    </html>
  );
}
