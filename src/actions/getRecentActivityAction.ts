'use server';
import { prisma } from '@/lib/prisma';

export interface RecentActivityItem {
  id: string;
  type: 'story' | 'script' | 'storyboard' | 'video';
  title: string;
  subtitle: string;
  timeAgo: string;
  timestamp: string;
  href: string;
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} mins ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return date.toLocaleDateString();
}

export async function getRecentActivityAction(): Promise<{ success: boolean; activities: RecentActivityItem[] }> {
  try {
    const activities: RecentActivityItem[] = [];

    // 1. Fetch latest stories
    const stories = await prisma.story.findMany({
      orderBy: { generated_at: 'desc' },
      take: 5,
    }).catch(() => []);

    for (const story of stories) {
      const topicSnippet = story.topic ? (story.topic.length > 35 ? story.topic.slice(0, 35) + '...' : story.topic) : 'Untitled Episode';
      const date = new Date(story.generated_at);
      activities.push({
        id: `story_${story.id}`,
        type: 'story',
        title: `Story "${topicSnippet}" created`,
        subtitle: `Stage: ${story.production_stage || 'story'}`,
        timeAgo: getTimeAgo(date),
        timestamp: date.toISOString(),
        href: `/episode-production/${story.id}`,
      });
    }

    // 2. Fetch latest scripts
    const scripts = await prisma.script.findMany({
      orderBy: { generated_at: 'desc' },
      take: 5,
    }).catch(() => []);

    for (const script of scripts) {
      const topicSnippet = script.topic ? (script.topic.length > 35 ? script.topic.slice(0, 35) + '...' : script.topic) : 'Untitled Script';
      const date = new Date(script.generated_at);
      activities.push({
        id: `script_${script.id}`,
        type: 'script',
        title: `Script "${topicSnippet}" generated`,
        subtitle: `Episode ${script.episode_number || '1'}`,
        timeAgo: getTimeAgo(date),
        timestamp: date.toISOString(),
        href: `/script-generate/${script.id}`,
      });
    }

    // 3. Fetch latest scenes with storyboards or videos
    const scenes = await prisma.scene.findMany({
      where: {
        OR: [
          { storyboard_image_url: { not: null } },
          { video_url: { not: null } },
        ],
      },
      orderBy: { updated_at: 'desc' },
      take: 5,
      include: {
        Story: true,
      },
    }).catch(() => []);

    for (const sc of scenes) {
      const date = new Date(sc.updated_at);
      if (sc.video_url) {
        activities.push({
          id: `video_${sc.id}`,
          type: 'video',
          title: `Scene #${sc.scene_number} video generated`,
          subtitle: sc.Story?.topic ? `Episode: ${sc.Story.topic.slice(0, 25)}...` : 'Scene video ready',
          timeAgo: getTimeAgo(date),
          timestamp: date.toISOString(),
          href: sc.story_id ? `/episode-production/${sc.story_id}` : '/episode-production',
        });
      } else if (sc.storyboard_image_url) {
        activities.push({
          id: `sb_${sc.id}`,
          type: 'storyboard',
          title: `Scene #${sc.scene_number} storyboard created`,
          subtitle: sc.Story?.topic ? `Episode: ${sc.Story.topic.slice(0, 25)}...` : 'Storyboard frame ready',
          timeAgo: getTimeAgo(date),
          timestamp: date.toISOString(),
          href: sc.story_id ? `/episode-production/${sc.story_id}` : '/episode-production',
        });
      }
    }

    // Sort combined activities by timestamp descending and take top 6
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return { success: true, activities: activities.slice(0, 6) };
  } catch (error: any) {
    console.error('Error in getRecentActivityAction:', error);
    return { success: false, activities: [] };
  }
}
