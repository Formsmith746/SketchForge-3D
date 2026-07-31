import { NextResponse, type NextRequest } from "next/server";

const redirectHosts = new Set([
  "sketchforge3d.vercel.app",
  "sketchforge-3d.vercel.app",
]);

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  const path = request.nextUrl.pathname;

  if (host && redirectHosts.has(host)) {
    const destination = request.nextUrl.clone();
    destination.protocol = "https";
    destination.hostname = "sketchforge3d.com";
    destination.port = "";

    return NextResponse.redirect(destination, 308);
  }

  if (
    path === "/beta"
    || path.startsWith("/beta/")
    || path === "/cloud"
    || path.startsWith("/cloud/")
    || path.startsWith("/api/cloud/")
    || path === "/data-retention"
    || path === "/refund-cancellation"
  ) {
    const demo = request.nextUrl.clone();
    demo.pathname = "/demo";

    return NextResponse.redirect(demo, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
