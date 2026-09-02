'use client';

import { useState, useEffect } from "react";
import {
  Film,
  Video as VideoIcon,
  Play,
  Loader2,
  Check,
  Trash2,
  Download,
  AlertCircle,
  Sparkles,
  Layers,
  Clock,
  ExternalLink
} from "lucide-react";
import {
  stitchEpisodeVideosAction,
  getEpisodeVideosAction,
  deleteEpisodeVideoAction
} from "@/actions/stitchVideosAction";
import { getSavedStoryboardsAction, getStoryboardByStoryIdAction } from "@/actions/saveStoryboardAction";

interface StoryOption {
  id: string;
  topic?: string;
  episode_number?: string;
}

interface SceneClip {
  id: string;
  scene_number: number;
  description?: string;
  location_name?: string;
  video_url: string;
  beat_numbers?: any;
}

interface SavedVideo {
  id: string;
  story_id?: string | null;
  title: string;
  video_url: string;
  duration?: string | null;
  created_at?: string | Date | null;
}

export default function VideoStitchingPage() {
  const [stories, setStories] = useState<StoryOption[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string>("");
  const [scenes, setScenes] = useState<SceneClip[]>([]);
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([]);

  const [customTitle, setCustomTitle] = useState("");
  const [isLoadingScenes, setIsLoadingScenes] = useState(false);
  const [isStitching, setIsStitching] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadStories() {
      try {
        const res = await getSavedStoryboardsAction();
        if (res.success && res.storyboards) {
          const list = res.storyboards.map(s => ({
            id: s.id,
            topic: s.topic,
            episode_number: s.episode_number
          }));
          setStories(list);
          if (list.length > 0) {
            setSelectedStoryId(list[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load stories with storyboards:", err);
      }
    }
    loadStories();
  }, []);

  useEffect(() => {
    if (!selectedStoryId) {
      setScenes([]);
      setSavedVideos([]);
      return;
    }

    const currentStory = stories.find(s => s.id === selectedStoryId);
    if (currentStory) {
      const topic = currentStory.topic || `Episode ${currentStory.episode_number || '1'}`;
      setCustomTitle(`${topic} - Full Episode`);
    }

    async function loadEpisodeData() {
      setIsLoadingScenes(true);
      setError(null);
      setSuccessMsg(null);

      try {
        const [sbRes, videosRes] = await Promise.all([
          getStoryboardByStoryIdAction(selectedStoryId),
          getEpisodeVideosAction(selectedStoryId)
        ]);

        if (sbRes.success && sbRes.scenes) {
          const videoScenes = (sbRes.scenes as any[])
            .filter((sc: any) => Boolean(sc.video_url))
            .sort((a: any, b: any) => (a.scene_number || 0) - (b.scene_number || 0));

          setScenes(videoScenes);
        }

        if (videosRes.success && videosRes.videos) {
          setSavedVideos(videosRes.videos as SavedVideo[]);
        }
      } catch (err: any) {
        console.error("Error loading episode scene videos:", err);
        setError("Failed to load scene clips for this episode.");
      } finally {
        setIsLoadingScenes(false);
      }
    }

    loadEpisodeData();
  }, [selectedStoryId, stories]);

  async function handleStitchVideos() {
    if (!selectedStoryId || scenes.length === 0) return;

    setIsStitching(true);
    setError(null);
    setSuccessMsg(null);

    const videoUrls = scenes.map(s => s.video_url);
    const sceneIds = scenes.map(s => s.id);
    const titleToUse = customTitle.trim() || "Full Episode Render";

    try {
      const res = await stitchEpisodeVideosAction({
        storyId: selectedStoryId,
        title: titleToUse,
        videoUrls,
        sceneIds
      });

      if (res.success && res.video) {
        setSuccessMsg("Successfully stitched episode video with FFmpeg!");
        setSavedVideos(prev => [res.video as unknown as SavedVideo, ...prev]);
      } else {
        setError(res.error || "Failed to stitch videos.");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred during video stitching.");
    } finally {
      setIsStitching(false);
    }
  }

  async function handleDeleteVideo(videoId: string) {
    if (!confirm("Are you sure you want to delete this full episode video? This will permanently remove the file from Supabase storage.")) {
      return;
    }

    setDeletingId(videoId);
    try {
      const res = await deleteEpisodeVideoAction(videoId);
      if (res.success) {
        setSavedVideos(prev => prev.filter(v => v.id !== videoId));
      } else {
        alert(res.error || "Failed to delete video.");
      }
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Film size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Video Stitching & Gallery
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Preview scene video clips, concatenate them into a full episode MP4 using FFmpeg, and save renders to Supabase.
          </p>
        </div>

        {/* Story Selector Dropdown */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
            Episode:
          </label>
          <select
            value={selectedStoryId}
            onChange={(e) => setSelectedStoryId(e.target.value)}
            className="bg-card text-foreground border border-border rounded-lg px-3.5 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[240px]"
          >
            {stories.map((story) => (
              <option key={story.id} value={story.id}>
                {story.topic ? `Ep ${story.episode_number || '1'} - ${story.topic}` : `Story #${story.id.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl text-sm font-medium flex items-center gap-2">
          <Check size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Scene Clips Timeline */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border/60 pb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Layers size={18} className="text-primary" />
              Generated Scene Clips ({scenes.length})
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Individual scene video clips generated for this episode in sequential order
            </p>
          </div>

          {/* Render Controls */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Render Title..."
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="bg-background text-foreground border border-border rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 flex-1 sm:w-64"
            />

            <button
              onClick={handleStitchVideos}
              disabled={isStitching || scenes.length === 0}
              className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-all rounded-lg font-semibold text-xs flex items-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {isStitching ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Stitching with FFmpeg...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Stitch Full Episode ({scenes.length} Scenes)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Scene Clips Grid */}
        {isLoadingScenes ? (
          <div className="py-12 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            Loading episode scene videos...
          </div>
        ) : scenes.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground space-y-2 border border-dashed border-border rounded-xl">
            <VideoIcon className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-semibold text-foreground">No scene video clips generated yet</p>
            <p className="text-xs text-muted-foreground">
              Generate scene video prompts in Episode Production to preview and stitch clips here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {scenes.map((scene, idx) => (
              <div
                key={scene.id}
                className="bg-muted/20 border border-border/70 rounded-xl overflow-hidden flex flex-col group hover:border-primary/40 transition-all"
              >
                {/* Header Badge */}
                <div className="p-3 bg-muted/40 border-b border-border/50 flex items-center justify-between text-xs">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">
                      #{scene.scene_number || idx + 1}
                    </span>
                    {scene.description ? scene.description.slice(0, 30) + '...' : `Scene #${idx + 1}`}
                  </span>
                  {scene.location_name && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium truncate max-w-[120px]">
                      {scene.location_name}
                    </span>
                  )}
                </div>

                {/* Video Player */}
                <div className="aspect-video bg-black relative flex items-center justify-center">
                  <video
                    src={scene.video_url}
                    controls
                    preload="metadata"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved Full Episode Renders Gallery */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <VideoIcon size={18} className="text-emerald-500" />
            Stitched Episode Renders ({savedVideos.length})
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full concatenated episode videos saved in Supabase Storage
          </p>
        </div>

        {savedVideos.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-xs border border-dashed border-border rounded-xl">
            No stitched full episode videos saved for this episode yet. Click "Stitch Full Episode" above to generate one!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {savedVideos.map((vid) => (
              <div
                key={vid.id}
                className="bg-muted/20 border border-border/80 rounded-2xl overflow-hidden flex flex-col shadow-sm"
              >
                {/* Full Video Player */}
                <div className="aspect-video bg-black relative">
                  <video
                    src={vid.video_url}
                    controls
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Details Footer */}
                <div className="p-4 flex flex-col justify-between flex-1 space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-foreground line-clamp-1">
                      {vid.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      {vid.created_at && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(vid.created_at).toLocaleDateString()} {new Date(vid.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between border-t border-border/50 pt-3">
                    <a
                      href={vid.video_url}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Download size={13} />
                      Download MP4
                    </a>

                    <button
                      onClick={() => handleDeleteVideo(vid.id)}
                      disabled={deletingId === vid.id}
                      className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {deletingId === vid.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Delete Render
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
