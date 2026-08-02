import type { Metadata, Viewport } from "next";
import { Pacifico, Sora, Karla, JetBrains_Mono } from "next/font/google";
import { PWAProvider } from "@/components/pwa-provider";
import { LicenseHeartbeat } from "@/components/license-heartbeat";
import { Toaster } from "sonner";
import "./globals.css";

const pacifico = Pacifico({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-brand",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-heading",
});

const karla = Karla({
  subsets: ["latin"],
  variable: "--font-body",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Mideli, Burger & Sushi",
  description: "Pedidos, cocina, cobro e inventario conectados para Mideli.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mideli",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#111014",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${pacifico.variable} ${sora.variable} ${karla.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <PWAProvider>
          <LicenseHeartbeat />
          {children}
        </PWAProvider>
        <Toaster
          theme="dark"
          position="top-center"
          closeButton
          toastOptions={{
            duration: 5000,
            style: {
              background: "#211d24",
              border: "1px solid #3a323d",
              color: "#fbf8e7",
              fontFamily: "var(--font-body)",
              boxShadow: "0 18px 48px rgba(0, 0, 0, 0.44)",
            },
          }}
        />
      </body>
    </html>
  );
}
