import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { exchangeYouTubeAuthorizationCode, getYouTubeChannel } from "@/lib/youtube";

function publishingUrl(status: string) {
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/api/youtube/callback";
  return new URL(`/video-approval?youtube=${status}`, new URL(redirectUri).origin);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("youtube_oauth_state")?.value;
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError || !code || !state || !expectedState || state !== expectedState) {
    const response = NextResponse.redirect(publishingUrl(oauthError ? "denied" : "invalid-state"));
    response.cookies.delete("youtube_oauth_state");
    return response;
  }

  try {
    const existing = await prisma.youTubeConnection.findUnique({ where: { id: "primary" } });
    const { client, tokens } = await exchangeYouTubeAuthorizationCode(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      throw new Error("Google did not return a refresh token. Reconnect and grant access again.");
    }

    const channel = await getYouTubeChannel(client);
    await prisma.youTubeConnection.upsert({
      where: { id: "primary" },
      create: {
        id: "primary",
        channel_id: channel.id,
        channel_title: channel.title,
        refresh_token: refreshToken,
        scopes: tokens.scope?.split(" ").filter(Boolean) ?? [],
        connected_by: user.id,
      },
      update: {
        channel_id: channel.id,
        channel_title: channel.title,
        refresh_token: refreshToken,
        scopes: tokens.scope?.split(" ").filter(Boolean) ?? existing?.scopes ?? [],
        connected_by: user.id,
        connected_at: new Date(),
        updated_at: new Date(),
      },
    });

    const response = NextResponse.redirect(publishingUrl("connected"));
    response.cookies.delete("youtube_oauth_state");
    return response;
  } catch (error) {
    console.error("YouTube OAuth callback failed:", error);
    const response = NextResponse.redirect(publishingUrl("connection-failed"));
    response.cookies.delete("youtube_oauth_state");
    return response;
  }
}
