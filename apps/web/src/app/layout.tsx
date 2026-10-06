import type { Metadata } from "next";
import { Quicksand } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import "driver.js/dist/driver.css";
import OfflineShell from "@/components/offline-shell";
const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-quicksand",
});
export const metadata: Metadata = {
  title: "Stocket · A little order, everywhere",
  description:
    "Your office stock, in your pocket. A friendly inventory manager for teams.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Stocket", statusBarStyle: "default" },
  icons: { apple: "/pwa-icon.png" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={quicksand.variable}>
        {children}
        <OfflineShell />
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              fontFamily: "var(--font-quicksand)",
              borderRadius: 16,
              fontSize: 16,
            },
          }}
        />
      </body>
    </html>
  );
}
