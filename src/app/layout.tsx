import type { Metadata } from "next";
import { Inter, Roboto_Slab } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { cn } from "@/lib/utils";

const robotoSlabHeading = Roboto_Slab({subsets:['latin'],variable:'--font-heading'});

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TilliTown Admin",
  description: "Admin dashboard for TilliTown operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(robotoSlabHeading.variable)} suppressHydrationWarning>
      <body className={cn(inter.className, "antialiased min-h-screen flex bg-background text-foreground")} suppressHydrationWarning>
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 p-8 md:p-10 overflow-y-auto h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
