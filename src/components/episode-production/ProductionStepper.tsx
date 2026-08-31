'use client';

const STAGES = [
  { key: 'locations', label: 'Locations' },
  { key: 'references', label: 'References' },
  { key: 'scenes', label: 'Scenes' },
  { key: 'storyboards', label: 'Storyboards' },
  { key: 'video', label: 'Video' },
] as const;

export type ProductionStageKey = typeof STAGES[number]['key'];

const STAGE_ORDER: ProductionStageKey[] = ['locations', 'references', 'scenes', 'storyboards', 'video'];

export function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage as ProductionStageKey);
  if (idx !== -1) return idx;
  if (stage === 'stylesheets') return 1; // legacy mapping
  if (stage === 'beats') return 4;       // legacy mapping
  return stage === 'complete' ? STAGE_ORDER.length : 0;
}


interface ProductionStepperProps {
  currentStage: string;
  activeStage: ProductionStageKey;
  onSelectStage: (stage: ProductionStageKey) => void;
}

export function ProductionStepper({ currentStage, activeStage, onSelectStage }: ProductionStepperProps) {
  const currentIdx = stageIndex(currentStage);

  return (
    <div className="flex flex-wrap gap-1 p-1 bg-muted/50 rounded-lg w-fit">
      {STAGES.map((stage, i) => {
        const unlocked = i <= currentIdx;
        const active = activeStage === stage.key;
        return (
          <button
            key={stage.key}
            type="button"
            disabled={!unlocked}
            onClick={() => onSelectStage(stage.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              active ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold">
              {i + 1}
            </span>
            {stage.label}
          </button>
        );
      })}
    </div>
  );
}
