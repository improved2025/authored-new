import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/start")) {
    const hasAuthCookie =
      req.cookies.has("sb-access-token") ||
      Array.from(req.cookies.getAll()).some((c) =>
        c.name.startsWith("sb-")
      );

    if (!hasAuthCookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/start/:path*"],
};