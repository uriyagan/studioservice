import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "אפליקציית שירות - סטודיו אוריה גנור",
  description: "מערכת ניהול שעות ופניות לקוחות",
  // The manifest link is emitted from app/manifest.ts automatically; these are
  // the iOS side of installing, which reads meta tags rather than the manifest.
  appleWebApp: {
    capable: true,
    // The iOS home-screen label — keep in step with `short_name` in
    // app/manifest.ts, which is the Android one.
    title: "סטודיו אוריה גנור",
    statusBarStyle: "default",
  },
  other: {
    // Next renders appleWebApp.capable as the standardised
    // `mobile-web-app-capable`. Safari only started honouring the manifest's
    // `display` in 16.4, so on an older iPhone that tag alone gets the app
    // launched as a Safari tab with browser chrome instead of standalone.
    // Deprecated and ignored by everything current — kept as the cheap half of
    // an asymmetric bet, since iOS is the one target we can't test here.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  // Spelled out rather than relying on Next's defaults, since the manifest and
  // a home-screen launch depend on them. No maximumScale/userScalable — pinch
  // zoom stays available (and note globals.css already scales the UI to 125%).
  width: "device-width",
  initialScale: 1,
  // Matches the manifest's theme_color and the NavBar it sits above.
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-sans antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
