'use client';

import { useState, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus, Save, Upload, Loader2, X, Trash2, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { GlassPanel } from '@/components/GlassPanel';
import { TakeCountSelect } from '@/components/TakePicker';
import { ReferenceTakes } from '@/components/library/ReferenceTakes';
import { Button } from '@/components/ui/button';
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/styles';

export interface LibraryItem {
  id: string;
  name: string;
  description: string;
  reference_image_url: string | null;
  created_at: string;
  magnific_identifier?: string | null;
  generated_image_url?: string | null;
}

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

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
  const [isFetchingItems, setIsFetchingItems] = useState(true);
  const [current, setCurrent] = useState<LibraryItem | null>(null);
  const [name, setName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [magnificIdentifier, setMagnificIdentifier] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isGeneratingSheet, setIsGeneratingSheet] = useState(false);
  const [hasGeneratedSheet, setHasGeneratedSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<string | null>(null);
  const [takesPerRun, setTakesPerRun] = useState(1);
  const [takesReloadKey, setTakesReloadKey] = useState(0);

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
    let cancelled = false;
    fetch(apiPath)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`Failed to load ${resourceNamePlural}`)))
      .then((data) => { if (!cancelled) setItems(data[listKey] || []); })
      .catch((err) => console.error(`Failed to load ${resourceNamePlural}`, err))
      .finally(() => { if (!cancelled) setIsFetchingItems(false); });
    return () => { cancelled = true; };
  }, [apiPath, listKey, resourceNamePlural]);

  const startCreate = () => {
    setGenerationNotice(null);
    setName('');
    setItemDescription('');
    setReferenceImageUrl(null);
    setGeneratedImageUrl(null);
    setMagnificIdentifier(null);
    setHasGeneratedSheet(false);
    setPendingFile(null);
    setPendingPreviewUrl(null);
    setCurrent(null);
    setViewMode('create');
  };

  const openItem = (item: LibraryItem) => {
    setGenerationNotice(null);
    setCurrent(item);
    setName(item.name);
    setItemDescription(item.description);
    setReferenceImageUrl(item.reference_image_url || null);
    setGeneratedImageUrl(item.generated_image_url || null);
    setMagnificIdentifier(item.magnific_identifier || null);
    setHasGeneratedSheet(Boolean(item.generated_image_url || item.magnific_identifier));
    setPendingFile(null);
    setPendingPreviewUrl(null);
    setViewMode('edit');
  };

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 6000);
  };

  const handleDelete = async () => {
    if (!current) return;
    if (!confirm(`Are you sure you want to delete "${current.name}"? This action cannot be undone.`)) {
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${apiPath}/${current.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to delete ${resourceName.toLowerCase()}.`);
      }
      setCurrent(null);
      await fetchItems();
      setViewMode('list');
    } catch (err: unknown) {
      showError(errorMessage(err, 'Failed to delete item.'));
    } finally {
      setIsDeleting(false);
    }
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

  const manualUploadImageUrl = pendingPreviewUrl || referenceImageUrl || current?.reference_image_url || null;

  const generatedOwnerType = ownerType === 'character_reference'
    ? 'character_generated' as const
    : 'location_generated' as const;

  // The form shows the reference sheet that is in use.
  const applyTakeInUse = (itemId: string, asset: { public_url: string; provider_identifier: string | null }) => {
    setGeneratedImageUrl(asset.public_url);
    setMagnificIdentifier(asset.provider_identifier);
    setHasGeneratedSheet(true);
    const withSheet = <T extends LibraryItem>(item: T): T => item.id === itemId
      ? { ...item, generated_image_url: asset.public_url, magnific_identifier: asset.provider_identifier }
      : item;
    setCurrent((existing) => existing ? withSheet(existing) : existing);
    setItems((existing) => existing.map(withSheet));
  };

  // Creates the item from the form, uploading a dropped reference image along the way.
  const createItem = async (): Promise<LibraryItem> => {
    const res = await fetch(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: itemDescription,
        reference_image_url: pendingFile ? null : manualUploadImageUrl,
        generated_image_url: generatedImageUrl,
        magnific_identifier: magnificIdentifier
      }),
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
        if (!uploadRes.ok) throw new Error('Image upload failed.');
        const uploadData = await uploadRes.json();
        const updateRes = await fetch(`${apiPath}/${created.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference_image_url: uploadData.publicUrl }),
        });
        if (!updateRes.ok) throw new Error('Image uploaded but could not be attached to the new item.');
        created.reference_image_url = uploadData.publicUrl;
        setReferenceImageUrl(uploadData.publicUrl);
      } catch (uploadErr) {
        console.error('Failed to upload image during creation', uploadErr);
        showError(errorMessage(uploadErr, 'Image upload failed.'));
      }
    }

    setCurrent(created);
    setPendingFile(null);
    setPendingPreviewUrl(null);
    await fetchItems();
    return created;
  };

  // Asks the image service for one reference sheet.
  const requestReferenceSheet = async (payload: { name: string; prompt: string; reference_url: string }) => {
    const webhookUrl = ownerType === 'character_reference'
      ? 'https://automation.tillitown.com/webhook/generate-character-image'
      : 'https://automation.tillitown.com/webhook/generate-image';
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || `The image service answered with HTTP ${res.status}.`);
    }

    const resData = await res.json();
    const first = Array.isArray(resData) ? resData[0] : resData;
    let url: string | null = null;
    let identifier: string | null = null;
    if (typeof first === 'string' && first.startsWith('http')) {
      url = first;
    } else if (typeof first === 'object' && first !== null) {
      url = first.url || first.generated_image_url || first.image_url || first.image || null;
      identifier = first.identifier || first.magnific_identifier || first.magnific_id || first.id || null;
    }

    if (!url) throw new Error('The image service returned no image.');
    if (ownerType === 'character_reference' && !identifier) {
      throw new Error('The image service returned an image without its identifier, so it cannot be used in storyboards.');
    }
    return { url, identifier };
  };

  // Generates `takesPerRun` reference sheets and saves each as a take. A new item is created first,
  // because a take has to belong to something.
  const handleGenerateReferenceSheet = async () => {
    if (!name.trim()) {
      showError(`Please enter a name for this ${resourceName.toLowerCase()} first.`);
      return;
    }
    if (!itemDescription.trim()) {
      showError(`Please enter a prompt description for this ${resourceName.toLowerCase()} first.`);
      return;
    }

    setIsGeneratingSheet(true);
    setError(null);
    setGenerationNotice(null);

    let saved = 0;
    try {
      let item = current;
      if (!item) {
        item = await createItem();
        setViewMode('edit');
      }

      let putInUse = false;
      for (let take = 1; take <= takesPerRun; take += 1) {
        if (takesPerRun > 1) setGenerationProgress(`Generating take ${take} of ${takesPerRun}…`);
        const generated = await requestReferenceSheet({
          name: name.trim(),
          prompt: itemDescription.trim(),
          reference_url: item.reference_image_url || referenceImageUrl || '',
        });

        const res = await fetch('/api/generated-image-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerType: generatedOwnerType,
            ownerId: item.id,
            imageUrl: generated.url,
            providerIdentifier: generated.identifier || undefined,
            promptUsed: itemDescription.trim(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'The reference sheet was generated but could not be saved.');
        if (data.asset?.is_selected) {
          applyTakeInUse(item.id, data.asset);
          putInUse = true;
        }
        if (data.warning) showError(data.warning);
        saved += 1;
        setTakesReloadKey((key) => key + 1);
      }

      const made = `${saved} reference sheet${saved === 1 ? '' : 's'} generated and saved.`;
      setGenerationNotice(
        !putInUse
          ? `${made} A new take is not used until you choose it.`
          : saved > 1
          ? `${made} The first take is in use until you choose another.`
          : made
      );
    } catch (err: unknown) {
      console.error(`Error generating ${resourceName.toLowerCase()} reference sheet:`, err);
      const reason = errorMessage(err, 'Failed to generate reference sheet.');
      showError(saved > 0 ? `${reason} ${saved} take${saved === 1 ? ' was' : 's were'} already saved.` : reason);
    } finally {
      setIsGeneratingSheet(false);
      setGenerationProgress(null);
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
      await createItem();
      setViewMode('list');
    } catch (err: unknown) {
      showError(errorMessage(err, 'Something went wrong.'));
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
        body: JSON.stringify({
          name,
          description: itemDescription,
          reference_image_url: manualUploadImageUrl,
          generated_image_url: generatedImageUrl,
          magnific_identifier: magnificIdentifier
        }),
      });
      if (!res.ok) throw new Error('Failed to save changes.');
      const data = await res.json();
      const updated: LibraryItem = data[itemKey];
      setCurrent(updated);
      await fetchItems();
      setViewMode('list');
    } catch (err: unknown) {
      showError(errorMessage(err, 'Something went wrong.'));
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
      setReferenceImageUrl(data.publicUrl);
      setCurrent({ ...current, reference_image_url: data.publicUrl });
      await fetchItems();
    } catch (err: unknown) {
      showError(errorMessage(err, 'Image upload failed.'));
    } finally {
      setIsUploadingImage(false);
    }
  };

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 pb-10">
      <PageHeader title={resourceNamePlural} description={description} />

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/80 hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {generationNotice && (
        <p role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
          {generationNotice}
        </p>
      )}

      {viewMode === 'list' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            onClick={startCreate}
            className="cursor-pointer group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors duration-300 min-h-[220px]"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-3">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-primary">Add {resourceName}</h3>
            <p className="text-sm text-muted-foreground mt-1 text-center">Create a new reusable {resourceName.toLowerCase()}</p>
          </div>

          {isFetchingItems ? (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm">Loading {resourceNamePlural.toLowerCase()}…</p>
            </div>
          ) : items.map((item) => {
            const cardImageUrl = item.generated_image_url || item.reference_image_url;
            return (
              <div
                key={item.id}
                onClick={() => openItem(item)}
                className="cursor-pointer group flex flex-col rounded-2xl border border-border bg-card overflow-hidden min-h-[220px]"
              >
                <div className="aspect-video w-full bg-muted flex items-center justify-center overflow-hidden">
                  {cardImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={cardImageUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <Icon className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{item.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2 flex-1">{item.description || 'No description yet.'}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(viewMode === 'create' || viewMode === 'edit') && (
        <div className="space-y-6">
          <GlassPanel
            footer={
              <div className="flex items-center justify-between w-full">
                {viewMode === 'edit' ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting || isSaving || isGeneratingSheet}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Delete {resourceName}
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={secondaryButtonClass}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={viewMode === 'create' ? handleCreate : handleSaveDetails}
                    disabled={isSaving || isDeleting || isGeneratingSheet}
                    className={primaryButtonClass}
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {viewMode === 'create' ? `Create ${resourceName}` : 'Save Changes'}
                  </button>
                </div>
              </div>
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

            {/* SECTION 1: Upload Reference Image (User Manual Upload / reference_image_url) */}
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

                {manualUploadImageUrl ? (
                  <div className="relative w-full max-w-md aspect-video rounded-xl overflow-hidden border border-border shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={manualUploadImageUrl}
                      alt="User Reference Upload Preview"
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
                    <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
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

            {/* SECTION 2: Generated reference sheets. Every one is kept as a take; one is in use. */}
            <div className="space-y-4 pt-4 border-t border-border/50">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1">
                  <p className={labelClass}>{resourceName} reference sheet</p>
                  <p className="max-w-[65ch] text-sm text-muted-foreground">
                    Generated from the prompt{viewMode === 'create' ? `. The ${resourceName.toLowerCase()} is created first, so each sheet can be kept` : ''}. Generate as many takes as you need, then choose the one storyboards and clips are built from.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <TakeCountSelect value={takesPerRun} onChange={setTakesPerRun} disabled={isGeneratingSheet} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerateReferenceSheet}
                    disabled={isGeneratingSheet || isSaving || isDeleting || !itemDescription.trim() || !name.trim()}
                  >
                    {isGeneratingSheet ? <Loader2 className="animate-spin" /> : hasGeneratedSheet ? <Plus /> : <Sparkles />}
                    {viewMode === 'create'
                      ? 'Create and generate'
                      : hasGeneratedSheet
                      ? (takesPerRun === 1 ? 'New take' : `${takesPerRun} new takes`)
                      : (takesPerRun === 1 ? 'Generate reference sheet' : `Generate ${takesPerRun} takes`)}
                  </Button>
                </div>
              </div>

              {isGeneratingSheet && (
                <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {generationProgress || 'Generating the reference sheet…'}
                </p>
              )}

              {viewMode === 'edit' && current && (
                <ReferenceTakes
                  ownerType={generatedOwnerType}
                  ownerId={current.id}
                  resourceName={resourceName}
                  reloadKey={takesReloadKey}
                  disabled={isSaving || isDeleting || isGeneratingSheet}
                  onChosen={(asset) => {
                    applyTakeInUse(current.id, asset);
                    setGenerationNotice(`This ${resourceName.toLowerCase()} now uses the chosen reference sheet.`);
                  }}
                />
              )}
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
