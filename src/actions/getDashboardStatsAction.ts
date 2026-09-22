"use server";

import { prisma } from "@/lib/prisma";

export interface DashboardStats {
  scriptsPending: number;
  videosToApprove: number;
  storyboardsActive: number;
  publishedThisWeek: number;
}

function startOfCurrentWeek() {
  const now = new Date();
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export async function getDashboardStatsAction(): Promise<{
  success: boolean;
  stats: DashboardStats;
}> {
  const fallback: DashboardStats = {
    scriptsPending: 0,
    videosToApprove: 0,
    storyboardsActive: 0,
    publishedThisWeek: 0,
  };

  try {
    const connection = await prisma.youTubeConnection.findUnique({
      where: { id: "primary" },
      select: { channel_id: true },
    }).catch(() => null);

    const results = await Promise.allSettled([
      prisma.story.count({
        where: { Script: { none: {} } },
      }),
      prisma.video.count({
        where: connection
          ? { YouTubeUpload: { none: { channel_id: connection.channel_id } } }
          : undefined,
      }),
      prisma.story.count({
        where: { production_stage: "storyboards" },
      }),
      prisma.youTubeUpload.count({
        where: {
          status: "published",
          uploaded_at: { gte: startOfCurrentWeek() },
        },
      }),
    ]);

    const value = (index: number) =>
      results[index].status === "fulfilled" ? results[index].value : 0;

    return {
      success: results.every((result) => result.status === "fulfilled"),
      stats: {
        scriptsPending: value(0),
        videosToApprove: value(1),
        storyboardsActive: value(2),
        publishedThisWeek: value(3),
      },
    };
  } catch (error) {
    console.error("Failed to load dashboard statistics:", error);
    return { success: false, stats: fallback };
  }
}
