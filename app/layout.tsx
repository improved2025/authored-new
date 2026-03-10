import type { Metadata } from "next";
import "./globals.css";

export const metadata = {
  title: {
    default: "Authored",
    template: "%s | Authored",
  },
  description:
    "Authored helps you turn scattered thoughts into a real manuscript.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return (
    <html lang="en">
      <body
        className="antialiased"
        style={{
          // ✅ Keep the same CSS variable names your app already uses
          // but set them to system stacks so there is ZERO build-time font fetching.
          ["--font-geist-sans" as any]:
            `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"`,
          ["--font-geist-mono" as any]:
            `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
        }}
      >
        {/* ✅ Surgical injection for legacy public/account.js */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__APP_CONFIG__ = {
                supabaseUrl: ${JSON.stringify(supabaseUrl || "")},
                supabaseAnonKey: ${JSON.stringify(supabaseAnonKey || "")}
              };
            `,
          }}
        />

        {children}
      </body>
    </html>
  );
}