"use client";

import { useState, useEffect, useRef, use } from "react";
import { PageHeader } from "@/components/PageHeader";
import { GlassPanel } from "@/components/GlassPanel";
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/lib/styles";
import { 
  Users, 
  Loader2, 
  ArrowLeft, 
  Save, 
  Upload, 
  Check, 
  Trash2, 
  AlertCircle,
  ExternalLink,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Character {
  id: string;
  name: string;
  description: string | null;
  reference_image_url: string | null;
  created_at?: string;
}

export default function CharacterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [character, setCharacter] = useState<Character | null>(null);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadCharacter() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/characters/${id}`);
        if (!res.ok) {
          throw new Error("Failed to fetch character details.");
        }
        const data = await res.json();
        if (data.character) {
          setCharacter(data.character);
          setName(data.character.name || '');
          setDescription(data.character.description || '');
          setReferenceImageUrl(data.character.reference_image_url || null);
        } else {
          setError("Character not found.");
        }
      } catch (err: any) {
        console.error("Error loading character:", err);
        setError(err.message || "Failed to load character.");
      } finally {
        setIsLoading(false);
      }
    }

    loadCharacter();
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Character name is required.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/characters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          reference_image_url: referenceImageUrl,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update character.");
      }

      const data = await res.json();
      if (data.character) {
        setCharacter(data.character);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err: any) {
      console.error("Error updating character:", err);
      setError(err.message || "Failed to update character.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImageUpload(file: File) {
    if (!file || !file.type.startsWith('image/')) {
      setError("Please select a valid image file.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('ownerType', 'character_reference');
      formData.append('ownerId', id);

      const res = await fetch('/api/image-assets', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to upload image.");
      }

      const data = await res.json();
      const imageUrl = data.asset?.public_url || data.publicUrl;

      if (imageUrl) {
        setReferenceImageUrl(imageUrl);
        await fetch(`/api/characters/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference_image_url: imageUrl }),
        });
      }
    } catch (err: any) {
      console.error("Error uploading character image:", err);
      setError(err.message || "Failed to upload character image.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete character "${name}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/characters/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push('/characters');
      } else {
        throw new Error("Failed to delete character.");
      }
    } catch (err: any) {
      console.error("Error deleting character:", err);
      setError(err.message || "Failed to delete character.");
      setIsDeleting(false);
    }
  }

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/characters"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Characters
        </Link>
      </div>

      <PageHeader
        icon={Users}
        title={character ? character.name : "Character Detail"}
        highlight="Reference"
        description="View and update character details, description, and visual stylesheet reference image."
      />

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Loading character details...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl flex items-center gap-3">
          <Check className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">Character details saved successfully!</span>
        </div>
      )}

      {!isLoading && character && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Reference Image Card */}
          <GlassPanel className="p-6 space-y-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Reference Image
            </h3>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.[0]) handleImageUpload(e.dataTransfer.files[0]);
              }}
              className={`aspect-square w-full rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center overflow-hidden relative ${
                isDragging
                  ? 'border-primary bg-primary/10'
                  : 'border-border/60 bg-muted/30 hover:border-border'
              }`}
            >
              {referenceImageUrl ? (
                <img
                  src={referenceImageUrl}
                  alt={name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground font-medium">
                    No reference image uploaded yet
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    Drag and drop or click to upload
                  </p>
                </div>
              )}

              {isUploading && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  <span className="text-xs font-semibold text-foreground">Uploading image...</span>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleImageUpload(e.target.files[0]);
              }}
            />

            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold transition cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              {referenceImageUrl ? "Change Image" : "Upload Reference Image"}
            </button>
          </GlassPanel>

          {/* Details Form */}
          <GlassPanel className="lg:col-span-2 p-6 space-y-6">
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <label className={labelClass}>Character Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldClass}
                  placeholder="Enter character name..."
                  required
                />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Description & Visual Details</label>
                <textarea
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={fieldClass}
                  placeholder="Describe character appearance, age, clothing, personality, and distinguishing features..."
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete Character
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
