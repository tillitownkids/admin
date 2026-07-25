import { PlayCircle, FileText, CheckCircle2 } from "lucide-react";

export interface Episode {
  episodeNumber: number;
  title: string;
  synopsis: string;
  script: string;
}

interface MultiEpisodeCardsProps {
  episodes: Episode[];
  onSelectEpisode: (ep: Episode) => void;
  selectedEpisodeNumber?: number;
}

export function MultiEpisodeCards({ 
  episodes, 
  onSelectEpisode,
  selectedEpisodeNumber
}: MultiEpisodeCardsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
        <FileText className="w-5 h-5 text-primary" />
        Generated Arc ({episodes.length} Episodes)
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {episodes.map((ep) => (
          <div
            key={ep.episodeNumber}
            onClick={() => onSelectEpisode(ep)}
            className={`cursor-pointer group flex flex-col p-5 rounded-xl border transition-colors duration-300 ${ selectedEpisodeNumber === ep.episodeNumber ? 'bg-primary/10 border-primary' : 'bg-card border-border' }`}
          >
            <div className="flex justify-between items-start mb-3">
              <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-bold uppercase tracking-wider">
                Episode {ep.episodeNumber}
              </span>
              {selectedEpisodeNumber === ep.episodeNumber && (
                <CheckCircle2 className="w-5 h-5 text-primary animate-in zoom-in duration-300" />
              )}
            </div>

            <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2">
              {ep.title}
            </h3>

            <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1">
              {ep.synopsis}
            </p>

            <div className="pt-3 border-t border-border/50 flex items-center justify-between mt-auto">
              <span className="text-sm font-medium text-primary flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                <FileText className="w-4 h-4" />
                {selectedEpisodeNumber === ep.episodeNumber ? 'Editing...' : 'View Script'}
              </span>
              <PlayCircle className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
