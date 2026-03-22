import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
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
          ["--font-geist-sans" as any]:
            `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"`,
          ["--font-geist-mono" as any]:
            `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
        }}
      >
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
        <Analytics />

        <Script id="tawk-to" strategy="afterInteractive">
          {`
            var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
            (function(){
              var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
              s1.async=true;
              s1.src='https://embed.tawk.to/69b94b0699e00a1c352dccc2/1jjtsq4qm';
              s1.charset='UTF-8';
              s1.setAttribute('crossorigin','*');
              s0.parentNode.insertBefore(s1,s0);
            })();
          `}
        </Script>
      </body>
    </html>
  );
}