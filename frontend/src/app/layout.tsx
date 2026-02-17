import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { QueryProvider } from "@/lib/query-provider";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "AutoStock - AI Stock Analysis",
  description: "Multi-Agent Stock Analysis System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <QueryProvider>
          <AuthProvider>
            <div className="flex flex-col lg:flex-row h-screen">
              <Sidebar />
              <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
            </div>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
