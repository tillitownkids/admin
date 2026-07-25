'use client';

import { useState, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus, Save, Sparkles, Upload, Loader2, ArrowLeft, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { GlassPanel } from '@/components/GlassPanel';
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/styles';

export interface LibraryItem {
  id: string;
  name: string;
  description: string;
  reference_image_url: string | null;
  created_at: string;
}

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
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [current, setCurrent] = useState<LibraryItem | null>(null);
  const [name, setName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCreate = () => {
    setName('');
    setItemDescription('');
    setCurrent(null);
    setViewMode('create');
  };

  const openItem = (item: LibraryItem) => {
    setCurrent(item);
    setName(item.name);
    setItemDescription(item.description);
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
          <div
            onClick={startCreate}
            className="cursor-pointer group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors duration-300 min-h-[220px]"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-primary">Add {resourceName}</h3>
            <p className="text-sm text-muted-foreground mt-1 text-center">Create a new reusable {resourceName.toLowerCase()}</p>
          </div>

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

          {viewMode === 'edit' && current && (
            <div className="space-y-3">
              <label className={labelClass}>Reference Image</label>

              {current.reference_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.reference_image_url}
                  alt={current.name}
                  className="w-full max-w-sm rounded-xl border border-border"
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
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

                <div className="space-y-2">
                  <input
                    type="text"
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Describe the reference image to generate..."
                    className={fieldClass}
                  />
                  <button
                    type="button"
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage || !imagePrompt.trim()}
                    className={primaryButtonClass}
                  >
                    {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Generate with AI
                  </button>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'create' && (
            <p className="text-sm text-muted-foreground">
              Save the {resourceName.toLowerCase()} first, then you can add a reference image.
            </p>
          )}
        </GlassPanel>
      )}
    </div>
  );
}
