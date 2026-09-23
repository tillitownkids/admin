import "server-only";

import { Readable } from "node:stream";
import { google } from "googleapis";

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

function getOAuthConfig() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("YouTube OAuth environment variables are not configured.");
  }

  return { clientId, clientSecret, redirectUri };
}

export function createYouTubeOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getYouTubeAuthorizationUrl(state: string) {
  return createYouTubeOAuthClient().generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: YOUTUBE_SCOPES,
    state,
  });
}

export async function exchangeYouTubeAuthorizationCode(code: string) {
  const client = createYouTubeOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return { client, tokens };
}

export async function getAuthorizedYouTubeClient(refreshToken: string) {
  const auth = createYouTubeOAuthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  await auth.getAccessToken();

  return {
    auth,
    youtube: google.youtube({ version: "v3", auth }),
  };
}

export async function getYouTubeChannel(auth = createYouTubeOAuthClient()) {
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.channels.list({
    part: ["id", "snippet"],
    mine: true,
  });
  const channel = response.data.items?.[0];

  if (!channel?.id) {
    throw new Error("The selected Google account does not have a YouTube channel.");
  }

  return {
    id: channel.id,
    title: channel.snippet?.title ?? null,
  };
}

export interface YouTubeUploadInput {
  refreshToken: string;
  sourceUrl: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: "private" | "unlisted" | "public";
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  onProgress?: (progress: number) => void;
}

export async function uploadVideoToYouTube(input: YouTubeUploadInput) {
  const source = await fetch(input.sourceUrl);
  if (!source.ok || !source.body) {
    throw new Error(`Could not download the stitched video (${source.status}).`);
  }

  const contentType = source.headers.get("content-type") || "video/mp4";
  const contentLength = Number(source.headers.get("content-length") || 0);
  const body = Readable.from(source.body as unknown as AsyncIterable<Uint8Array>);
  const { youtube } = await getAuthorizedYouTubeClient(input.refreshToken);

  const response = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      notifySubscribers: false,
      requestBody: {
        snippet: {
          title: input.title,
          description: input.description,
          tags: input.tags,
          categoryId: input.categoryId,
        },
        status: {
          privacyStatus: input.privacyStatus,
          selfDeclaredMadeForKids: input.madeForKids,
          containsSyntheticMedia: input.containsSyntheticMedia,
        },
      },
      media: {
        mimeType: contentType,
        body,
      },
    },
    {
      onUploadProgress: ({ bytesRead }) => {
        if (contentLength > 0) {
          input.onProgress?.(Math.min(99, Math.round((bytesRead / contentLength) * 100)));
        }
      },
    },
  );

  if (!response.data.id) {
    throw new Error("YouTube accepted the upload but did not return a video ID.");
  }

  return {
    id: response.data.id,
    url: `https://www.youtube.com/watch?v=${response.data.id}`,
    uploadStatus: response.data.status?.uploadStatus ?? "uploaded",
  };
}

export async function getYouTubeVideoStatus(refreshToken: string, videoId: string, channelId: string) {
  const { auth, youtube } = await getAuthorizedYouTubeClient(refreshToken);
  const channel = await getYouTubeChannel(auth);
  if (channel.id !== channelId) {
    throw new Error("Reconnect the channel that owns this upload to refresh its status.");
  }
  const response = await youtube.videos.list({
    part: ["status", "processingDetails"],
    id: [videoId],
  });
  const video = response.data.items?.[0];

  if (!video) {
    return null;
  }

  return {
    uploadStatus: video.status?.uploadStatus ?? null,
    processingStatus: video.processingDetails?.processingStatus ?? null,
    failureReason: video.status?.failureReason ?? video.processingDetails?.processingFailureReason ?? null,
  };
}

export async function revokeYouTubeToken(refreshToken: string) {
  const auth = createYouTubeOAuthClient();
  await auth.revokeToken(refreshToken);
}
