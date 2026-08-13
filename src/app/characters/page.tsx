"use client";

import { useEffect, useState } from "react";
import { Users, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

interface Character {
  id: string;
  name: string;
  description: string | null;
  reference_image_url: string | null;
  created_at?: string;
}

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCharacters() {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch("/api/characters");
        if (!res.ok) {
          throw new Error("Failed to fetch characters");
        }
        const data = await res.json();
        setCharacters(data.characters || []);
      } catch (err: any) {
        console.error("Error loading characters:", err);
        setError(err.message || "Failed to load characters");
      } finally {
        setIsLoading(false);
      }
    }

    fetchCharacters();
  }, []);

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={Users}
        title="Characters"
        highlight="Library"
        description="Reusable character references, kept consistent across every episode."
      />

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">
            Loading characters...
          </p>
        </div>
      )}

      {!isLoading && error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl flex items-center gap-3 animate-in fade-in duration-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {!isLoading && !error && characters.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-border rounded-2xl bg-card/50 my-6">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No Characters Found</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            There are currently no characters available in the database.
          </p>
        </div>
      )}

      {!isLoading && !error && characters.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {characters.map((character) => (
            <div
              key={character.id}
              className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden min-h-[220px] shadow-sm hover:border-primary/40 transition-all"
            >
              {character.reference_image_url ? (
                <a
                  href={character.reference_image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-video w-full bg-muted flex items-center justify-center overflow-hidden relative group cursor-pointer"
                  title="Click to view image in full screen"
                >
                  <img
                    src={character.reference_image_url}
                    alt={character.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-3">
                    <span className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-lg flex items-center gap-2 group-hover:scale-105 transition-transform">
                      <ExternalLink className="w-4 h-4" /> View Fullscreen
                    </span>
                  </div>
                </a>
              ) : (
                <div className="aspect-video w-full bg-muted flex items-center justify-center">
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-lg font-bold text-foreground">
                  {character.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-3 flex-1">
                  {character.description || "No description available."}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
