import { NextResponse } from "next/server";
import { revalidatePrismicPages } from "@prismicio/next";

export async function POST(request: Request) {
	const body = await request.json();

	const secret = process.env.PRISMIC_WEBHOOK_SECRET;
	if (secret && body.secret !== secret) {
		return NextResponse.json({ revalidated: false }, { status: 401 });
	}

	if (body.type === "api-update") revalidatePrismicPages(body.documents);

	return NextResponse.json({ revalidated: true, now: Date.now() });
}
