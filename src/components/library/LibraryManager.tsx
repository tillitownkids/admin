'use client';

import { useState, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus, Save, Sparkles, Upload, Loader2, ArrowLeft, X, Image as ImageIcon, RefreshCw, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { GlassPanel } from '@/components/GlassPanel';
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/styles';
import { getStoriesAction } from '@/actions/saveStoryAction';

export interface LibraryItem {
  id: string;
  name: string;
  description: string;
  reference_image_url: string | null;
  created_at: string;
}

const mock_story_locations = [
  {
    id: "story-loc-1",
    storyTitle: "The Great Candy Forest Adventure",
    locationName: "Whispering Candy Forest",
    description: "An enchanted forest filled with giant lollipop trees, glowing gummy lantern flowers, and winding caramel pathways.",
    prompt: "Wide establishing shot of the Whispering Candy Forest with giant lollipop trees, glowing gummy lantern flowers, and winding caramel pathways under a magical golden sunlight. Vibrant 3D animation style."
  },
  {
    id: "story-loc-2",
    storyTitle: "Bumble's Honey & Pastry Festival",
    locationName: "Golden Honey Cavern Bakery",
    description: "An underground bakery built inside a golden honey cavern featuring rich chocolate waterfalls, crystal amber lamps, and warm stone tables.",
    prompt: "An inviting underground chocolate bakery inside a golden honey cavern, featuring rich chocolate waterfalls, glowing amber crystal lamps, fresh pastry racks, and warm stone tables. Pixar-style 3D render."
  },
  {
    id: "story-loc-3",
    storyTitle: "Zap's Stormy Rescue",
    locationName: "Crystalline Lightning Mountain",
    description: "A high-altitude mountain peak topped with electric blue crystalline towers, swirling storm clouds, and floating sky bridges.",
    prompt: "A high-altitude crystalline lookout tower perched on a floating cloud mountain, illuminated by electric blue aura lines, swirling magical clouds, and a starlit night sky. 3D animated style."
  }
];

interface LibraryManagerProps {
  resourceName: string;
  resourceNamePlural: string;
  apiPath: string;
  listKey: string;
  itemKey: string;
  ownerType: 'character_reference' | 'location_reference';
  icon: LucideIcon;
  description: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
}

export function LibraryManager({
  resourceName,
  resourceNamePlural,
  apiPath,
  listKey,
  itemKey,
  ownerType,
  icon: Icon,
  description,
  namePlaceholder,
  descriptionPlaceholder,
}: LibraryManagerProps) {
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit'>('list');
  const [createType, setCreateType] = useState<'scratch' | 'from_story'>('scratch');
  const [selectedStoryId, setSelectedStoryId] = useState<string>('');
  const [storiesList, setStoriesList] = useState<Array<{ id: string; topic: string; content?: string }>>([]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [current, setCurrent] = useState<LibraryItem | null>(null);
  const [name, setName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for Add/Edit Character & Location screen image generation
  const [imageCount, setImageCount] = useState<number>(4);
  const [generatedImages, setGeneratedImages] = useState<any[]>();
  const [isBatchGenerating, setIsBatchGenerating] = useState<boolean>(false);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = async () => {
    try {
      const res = await fetch(apiPath);
      if (res.ok) {
        const data = await res.json();
        setItems(data[listKey] || []);
      }
    } catch (e) {
      console.error(`Failed to load ${resourceNamePlural}`, e);
    }
  };

  const loadStoriesFromDatabase = async () => {
    try {
      const res = await getStoriesAction();
      if (res.success && res.stories && res.stories.length > 0) {
        setStoriesList(res.stories as any);
      }
    } catch (e) {
      console.error('Failed to fetch stories for library manager:', e);
    }
  };

  useEffect(() => {
    fetchItems();
    loadStoriesFromDatabase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCreate = () => {
    setCreateType('scratch');
    setSelectedStoryId('');
    setName('');
    setItemDescription('');
    setImagePrompt('');
    setGeneratedImages(undefined);
    setCurrent(null);
    loadStoriesFromDatabase();
    setViewMode('create');
  };

  const startCreateFromStory = async () => {
    setCreateType('from_story');
    setGeneratedImages(undefined);
    setCurrent(null);
    await loadStoriesFromDatabase();

    if (storiesList.length > 0) {
      const first = storiesList[0];
      setSelectedStoryId(first.id);
      const title = first.topic || (first as any).concept?.slice(0, 40) || 'Untitled Story';
      setName(`${title} Location`);
      const rawText = first.content ? first.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ((first as any).concept || '');
      setItemDescription(rawText.length > 300 ? rawText.slice(0, 300) + '...' : rawText);
      setImagePrompt(`Wide establishing shot of ${title} location, vibrant 3D animation style.`);
    } else {
      const defaultStory = mock_story_locations[0];
      setSelectedStoryId(defaultStory.id);
      setName(defaultStory.locationName);
      setItemDescription(defaultStory.description);
      setImagePrompt(defaultStory.prompt);
    }

    setViewMode('create');
  };

  const openItem = (item: LibraryItem) => {
    setCurrent(item);
    setName(item.name);
    setItemDescription(item.description);
    setImagePrompt(item.description || '');
    setGeneratedImages(undefined);
    setViewMode('edit');
  };

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 6000);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      showError(`Please enter a name for this ${resourceName.toLowerCase()}.`);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: itemDescription }),
      });
      if (!res.ok) throw new Error(`Failed to create ${resourceName.toLowerCase()}.`);
      const data = await res.json();
      const created: LibraryItem = data[itemKey];
      setCurrent(created);
      await fetchItems();
      setViewMode('edit');
    } catch (err: any) {
      showError(err.message || 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!current) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiPath}/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: itemDescription }),
      });
      if (!res.ok) throw new Error('Failed to save changes.');
      const data = await res.json();
      const updated: LibraryItem = data[itemKey];
      setCurrent(updated);
      await fetchItems();
    } catch (err: any) {
      showError(err.message || 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!current || !imagePrompt.trim()) return;
    setIsGeneratingImage(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptText: imagePrompt, ownerType, ownerId: current.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate image.');
      }
      const data = await res.json();
      setCurrent({ ...current, reference_image_url: data.publicUrl });
      await fetchItems();
    } catch (err: any) {
      showError(err.message || 'Image generation failed.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleUploadImage = async (file: File) => {
    if (!current) return;
    setIsUploadingImage(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('ownerType', ownerType);
      formData.append('ownerId', current.id);
      const res = await fetch('/api/images/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to upload image.');
      }
      const data = await res.json();
      setCurrent({ ...current, reference_image_url: data.publicUrl });
      await fetchItems();
    } catch (err: any) {
      showError(err.message || 'Image upload failed.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Multi-image generation for Add/Edit Character & Location screen
  const handleBatchGenerate = async () => {
    setIsBatchGenerating(true);
    try {
      const response = await fetch(`https://picsum.photos/v2/list?limit=${imageCount}`);
      const data = await response.json();
      setGeneratedImages(data);
    } catch (err) {
      console.error("Error generating images", err);
      showError("Failed to generate images.");
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const regenerateBatchImage = async (index: number) => {
    setRegeneratingIndex(index);
    try {
      const response = await fetch(`https://picsum.photos/seed/${Math.random()}/200/300`);
      const newImages = (generatedImages || []).map((img: any, i: number) => {
        if (i === index) {
          return {
            ...img,
            download_url: response.url,
          };
        }
        return img;
      });
      setGeneratedImages(newImages);
    } catch (err) {
      console.error("Error regenerating image", err);
    } finally {
      setRegeneratingIndex(null);
    }
  };

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={Icon}
        title={resourceNamePlural}
        highlight="Library"
        description={description}
        action={
          viewMode !== 'list' && (
            <button
              onClick={() => setViewMode('list')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 hover:bg-secondary text-secondary-foreground transition-colors font-medium text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Library
            </button>
          )
        }
      />

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center justify-between animate-in fade-in duration-300">
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/80 hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Action Card 1: Add Location / Character from scratch */}
          <div
            onClick={startCreate}
            className="cursor-pointer group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors duration-300 min-h-[220px]"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-primary">Add {resourceName}</h3>
            <p className="text-sm text-muted-foreground mt-1 text-center">Create a new reusable {resourceName.toLowerCase()} based on prompt</p>
          </div>

          {/* Action Card 2: Create Location from Story (for Locations Page) */}
          {(ownerType === 'location_reference' || resourceName === 'Location') && (
            <div
              onClick={startCreateFromStory}
              className="cursor-pointer group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors duration-300 min-h-[220px]"
            >
              <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-primary">Location from Story</h3>
              <p className="text-sm text-muted-foreground mt-1 text-center">Create a location based on generated stories</p>
            </div>
          )}

          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => openItem(item)}
              className="cursor-pointer group flex flex-col rounded-2xl border border-border bg-card overflow-hidden min-h-[220px]"
            >
              <div className="aspect-video w-full bg-muted flex items-center justify-center overflow-hidden">
                {item.reference_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.reference_image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <Icon className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{item.name}</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2 flex-1">{item.description || 'No description yet.'}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {(viewMode === 'create' || viewMode === 'edit') && (
        <div className="space-y-6">
          <GlassPanel
            footer={
              <button
                onClick={viewMode === 'create' ? handleCreate : handleSaveDetails}
                disabled={isSaving}
                className={primaryButtonClass}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {viewMode === 'create' ? `Create ${resourceName}` : 'Save Changes'}
              </button>
            }
          >
            
            {viewMode === 'create' && (
              <div className="space-y-3 p-4 rounded-xl border border-primary/20 mb-6 bg-primary/5">
                <label className={labelClass + " text-primary flex items-center gap-2 font-semibold"}>
                  <BookOpen className="w-4 h-4 text-primary" />
                  Select Story from Database
                </label>
                <div className="relative">
                  <select
                    value={selectedStoryId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedStoryId(val);
                      if (!val) return;

                      // Check in user stories from Supabase
                      const userStory = storiesList.find((s) => s.id === val);
                      if (userStory) {
                        const storyTitle = userStory.topic || (userStory as any).concept?.slice(0, 40) || "Untitled Story";
                        setName(`${storyTitle} Location`);
                        const rawText = userStory.content ? userStory.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ((userStory as any).concept || "");
                        const desc = rawText.length > 300 ? rawText.slice(0, 300) + '...' : rawText;
                        setItemDescription(desc || `Location setting for ${storyTitle}`);
                        setImagePrompt(`Wide establishing shot of ${storyTitle} location, vibrant 3D animation style.`);
                        return;
                      }

                      // Check in mock story presets
                      const match = mock_story_locations.find((s) => s.id === val);
                      if (match) {
                        setName(match.locationName);
                        setItemDescription(match.description);
                        setImagePrompt(match.prompt);
                      }
                    }}
                    className="w-full appearance-none bg-background border border-input rounded-xl px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer text-foreground"
                  >
                    <option value="">-- Choose a story from database to autofill --</option>
                    {storiesList.length > 0 && (
                      <optgroup label="Fetched Stories from Database">
                        {storiesList.map((story: any) => (
                          <option key={story.id} value={story.id}>
                            {story.topic || story.concept?.slice(0, 40) || 'Untitled Story'}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Story Presets">
                      {mock_story_locations.map((story) => (
                        <option key={story.id} value={story.id}>
                          {story.storyTitle} — {story.locationName}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m8 9 4-4 4 4m0 6-4 4-4-4"></path></svg>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <label className={labelClass}>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={namePlaceholder}
                className={fieldClass}
              />
            </div>

            <div className="space-y-3">
              <label className={labelClass}>Description</label>
              <textarea
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder={descriptionPlaceholder}
                rows={4}
                className={fieldClass}
              />
            </div>

            <div className="space-y-4 pt-4 border-t border-border/50">
              <label className={labelClass}>Generate Reference Images</label>

              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prompt</label>
                  <textarea
                    rows={4}
                    value={imagePrompt || (itemDescription ? `${resourceName} reference sheet for ${name || resourceName}. ${itemDescription}` : '')}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Enter prompt for reference image generation..."
                    className={fieldClass}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Number of Images</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={imageCount}
                      onChange={(e) => setImageCount(Number(e.target.value))}
                      className={fieldClass}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleBatchGenerate}
                    disabled={isBatchGenerating}
                    className={primaryButtonClass}
                  >
                    {isBatchGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating Images...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate {resourceName} Images
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {viewMode === 'edit' && current && (
              <div className="space-y-3 pt-4 border-t border-border/50">
                <label className={labelClass}>Current Reference Image</label>

                {current.reference_image_url && (
                  <img
                    src={current.reference_image_url}
                    alt={current.name}
                    className="w-full max-w-sm rounded-xl border border-border"
                  />
                )}

                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadImage(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className={secondaryButtonClass}
                  >
                    {isUploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload Image
                  </button>
                </div>
              </div>
            )}
          </GlassPanel>

          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">
                Generated Images
              </h2>

              <span className="text-sm text-muted-foreground">
                {generatedImages && generatedImages.length > 0
                  ? `${generatedImages.length} frame${generatedImages.length > 1 ? "s" : ""} generated`
                  : "Images will appear here"}
              </span>
            </div>

            {!generatedImages || generatedImages.length === 0 ? (
              <div className="mt-6 flex h-72 items-center justify-center rounded-xl border border-dashed p-4">
                <div className="text-center">
                  <ImageIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />

                  <p className="font-medium">
                    No images generated yet
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Set the prompt, select number of images, and click generate to create {resourceName.toLowerCase()} reference images.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {generatedImages.map((data: any, index: number) => (
                  <div
                    key={data.id || index}
                    className="group relative flex flex-col rounded-2xl border bg-background overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border-border/60 hover:border-primary/40"
                  >
                    <div className="relative aspect-video w-full bg-muted overflow-hidden">
                      <img
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        src={data.download_url}
                        alt={`Generated frame ${index + 1}`}
                        loading="lazy"
                      />
                      <div className="absolute top-3 left-3 bg-background/80 backdrop-blur-md border border-border/50 text-foreground text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm">
                        Frame #{index + 1}
                      </div>

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2 p-4">
                        <button
                          type="button"
                          onClick={async () => {
                            await regenerateBatchImage(index);
                          }}
                          disabled={regeneratingIndex === index}
                          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-background/90 hover:bg-background text-foreground text-xs font-semibold backdrop-blur-md shadow-md hover:scale-105 transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${regeneratingIndex === index ? "animate-spin text-primary" : ""}`} />
                          <span>{regeneratingIndex === index ? "Regenerating..." : "Regenerate"}</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 flex items-center justify-between border-t bg-card/50 text-xs">
                      <span className="text-muted-foreground truncate max-w-[130px]">
                        {data.author ? `By ${data.author}` : `${name || resourceName} #${index + 1}`}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await regenerateBatchImage(index);
                        }}
                        disabled={regeneratingIndex === index}
                        className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${regeneratingIndex === index ? "animate-spin" : ""}`} />
                        Regenerate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
