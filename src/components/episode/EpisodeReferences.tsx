"use client";

import Link from "next/link";
import { AlertTriangle, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Reference {
  id: string;
  name: string;
  hasReference: boolean;
}

function ReferenceList({ label, href, items }: { label: string; href: string; items: Reference[] }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">
        {label} · <Link href={href} className="underline underline-offset-4 hover:text-foreground">open library</Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None linked to this episode.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge key={item.id} variant={item.hasReference ? "outline" : "destructive"} title={item.hasReference ? undefined : "No reference sheet yet"}>
              {!item.hasReference && <AlertTriangle />}
              {item.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** The episode's cast and locations, out of the way until asked for. Missing reference sheets are called out because they block image and video generation. */
export function EpisodeReferences({ characters, locations }: { characters: Reference[]; locations: Reference[] }) {
  const missing = [...characters, ...locations].filter((item) => !item.hasReference).length;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button variant="ghost" size="sm" className="group/trigger -ml-2 text-muted-foreground">
            {plural(characters.length, "character")}, {plural(locations.length, "location")}
            {missing > 0 && (
              <Badge variant="destructive">
                <AlertTriangle />
                {missing} without a reference sheet
              </Badge>
            )}
            <ChevronDown className="transition-transform group-data-[panel-open]/trigger:rotate-180" />
          </Button>
        }
      />
      <CollapsibleContent>
        <div className="mt-2 grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
          <ReferenceList label="Characters" href="/characters" items={characters} />
          <ReferenceList label="Locations" href="/locations" items={locations} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
