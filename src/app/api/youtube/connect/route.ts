import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getYouTubeAuthorizationUrl } from "@/lib/youtube";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000"));
  }

  const state = randomBytes(32).toString("hex");
  const response = NextResponse.redirect(getYouTubeAuthorizationUrl(state));
  response.cookies.set("youtube_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: "/",
  });
  return response;
}
