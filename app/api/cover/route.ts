import { NextRequest, NextResponse } from "next/server";

const ALLOWED = new Set(["images.prismic.io", "images.cdn.prismic.io"]);

/**
 * Same-origin proxy for book covers so WebGL can sample them without CORS.
 * Only allows known Prismic/imgix hosts.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("u");
  if (!raw) {
    return NextResponse.json({ error: "missing u" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }

  if (target.protocol !== "https:" || !ALLOWED.has(target.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 });
  }

  // Prefer a modest JPEG for spine textures.
  if (!target.searchParams.has("w")) target.searchParams.set("w", "240");
  if (!target.searchParams.has("auto")) target.searchParams.set("auto", "format,compress");

  const upstream = await fetch(target.toString(), {
    headers: { Accept: "image/*" },
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
