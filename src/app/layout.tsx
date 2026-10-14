import type { Metadata } from "next";
import { Suspense } from "react";
import GoogleLeadRecoveryGuard from "@/components/GoogleLeadRecoveryGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "MEO AIO School",
  description: "学習塾向け MEO/AIO 口コミアシスト",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body><Suspense fallback={null}><GoogleLeadRecoveryGuard /></Suspense>{children}</body>
    </html>
  );
}
