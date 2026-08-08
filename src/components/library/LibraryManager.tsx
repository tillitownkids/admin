'use client';

import { useState, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus, Save, Upload, Loader2, X } from 'lucide-react';
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
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drag & drop reference image state
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);

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
    setPendingFile(null);
    setPendingPreviewUrl(null);
    setCurrent(null);
    setViewMode('create');
  };

  const openItem = (item: LibraryItem) => {
    setCurrent(item);
    setName(item.name);
    setItemDescription(item.description);
    setPendingFile(null);
    setPendingPreviewUrl(null);
    setViewMode('edit');
  };

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 6000);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        handleFileSelected(file);
      } else {
        showError('Please drop an image file (PNG, JPG, WEBP, GIF).');
      }
    }
  };

  const handleFileSelected = async (file: File) => {
    if (viewMode === 'edit' && current) {
      await handleUploadImage(file);
    } else {
      setPendingFile(file);
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      setPendingPreviewUrl(URL.createObjectURL(file));
    }
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

      if (pendingFile) {
        try {
          const formData = new FormData();
          formData.append('file', pendingFile);
          formData.append('ownerType', ownerType);
          formData.append('ownerId', created.id);
          const uploadRes = await fetch('/api/images/upload', { method: 'POST', body: formData });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            created.reference_image_url = uploadData.publicUrl;
          }
        } catch (uploadErr) {
          console.error('Failed to upload image during creation', uploadErr);
        }
      }

      setCurrent(created);
      setPendingFile(null);
      setPendingPreviewUrl(null);
      await fetchItems();
      setViewMode('list');
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
      setViewMode('list');
    } catch (err: any) {
      showError(err.message || 'Something went wrong.');
    } finally {
      setIsSaving(false);
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

  const displayImageUrl = current?.reference_image_url || pendingPreviewUrl;

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={Icon}
        title={resourceNamePlural}
        highlight="Library"
        description={description}
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
              <label className={labelClass}>Prompt</label>
              <textarea
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder={descriptionPlaceholder}
                rows={4}
                className={fieldClass}
              />
            </div>

            <div className="space-y-3 pt-4 border-t border-border/50">
              <label className={labelClass}>Upload Reference Image</label>

              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                  e.target.value = '';
                }}
              />

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`group relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer text-center ${
                  isDragging
                    ? 'border-primary bg-primary/10 scale-[1.01]'
                    : 'border-border/80 hover:border-primary/50 bg-muted/20 hover:bg-muted/40'
                }`}
              >
                {isUploadingImage && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 space-y-2 rounded-2xl">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm font-medium text-foreground">Uploading image...</p>
                  </div>
                )}

                {displayImageUrl ? (
                  <div className="relative w-full max-w-md aspect-video rounded-xl overflow-hidden border border-border shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={displayImageUrl}
                      alt="Reference Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <span className="px-4 py-2 bg-background/90 text-foreground text-xs font-semibold rounded-lg shadow-sm backdrop-blur-sm">
                        Click or drag to replace image
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-3">
                    <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Upload className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-foreground">
                        Drag & drop reference image here, or <span className="text-primary underline underline-offset-2">browse</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports PNG, JPG, WEBP, GIF (up to 10MB)
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

