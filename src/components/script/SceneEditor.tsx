'use client';

import { useState } from 'react';
import { Scene, DialogueLine } from '@/types/script';
import { DialogueEditor } from './DialogueEditor';
import { ChevronDown, ChevronRight, Trash2, Plus, Film, MessageSquare, AlignLeft } from 'lucide-react';
import { fieldClass, labelClass, secondaryButtonClass } from '@/lib/styles';

interface SceneEditorProps {
  scene: Scene;
  onChange: (updated: Scene) => void;
  onDelete: () => void;
}

export function SceneEditor({ scene, onChange, onDelete }: SceneEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleSettingChange = (setting: string) => {
    onChange({ ...scene, setting });
  };

  const handleNarrationChange = (narration: string) => {
    onChange({ ...scene, narration });
  };

  const handleDialogueChange = (index: number, updated: DialogueLine) => {
    const updatedDialogues = [...scene.dialogues];
    updatedDialogues[index] = updated;
    onChange({ ...scene, dialogues: updatedDialogues });
  };

  const handleAddDialogue = () => {
    const updatedDialogues = [...scene.dialogues, { character: '', line: '' }];
    onChange({ ...scene, dialogues: updatedDialogues });
  };

  const handleDeleteDialogue = (index: number) => {
    const updatedDialogues = scene.dialogues.filter((_, i) => i !== index);
    onChange({ ...scene, dialogues: updatedDialogues });
  };

  return (
    <div className="border border-border/60 rounded-2xl bg-card/80 overflow-hidden transition-colors">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <button type="button" className="text-muted-foreground hover:text-foreground">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary">
            <Film className="w-3 h-3" />
            Scene {scene.sceneNumber}
          </span>
          <span className="text-sm font-semibold text-foreground truncate max-w-[300px] sm:max-w-[500px]">
            {scene.setting || 'Untitled Setting'}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          title="Delete Scene"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="p-5 space-y-5 border-t border-border/40">
          {/* Setting */}
          <div className="space-y-2">
            <label className={labelClass}>
              <Film className="w-3.5 h-3.5 text-primary" />
              Setting / Heading
            </label>
            <input
              type="text"
              value={scene.setting}
              onChange={(e) => handleSettingChange(e.target.value)}
              placeholder="e.g. INT. TILLITOWN BAKERY - DAY"
              className={fieldClass}
            />
          </div>

          {/* Narration */}
          <div className="space-y-2">
            <label className={labelClass}>
              <AlignLeft className="w-3.5 h-3.5 text-primary" />
              Narration / Action Notes
            </label>
            <textarea
              value={scene.narration}
              onChange={(e) => handleNarrationChange(e.target.value)}
              placeholder="Description of the scene visual action and narration..."
              rows={3}
              className={fieldClass}
            />
          </div>

          {/* Dialogues */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>
                <MessageSquare className="w-3.5 h-3.5 text-primary" />
                Dialogues ({scene.dialogues.length})
              </label>
              <button
                type="button"
                onClick={handleAddDialogue}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Dialogue Line
              </button>
            </div>

            {scene.dialogues.length === 0 ? (
              <p className="text-xs text-muted-foreground italic p-3 rounded-xl border border-dashed border-border/50 text-center">
                No dialogue lines in this scene yet. Click &quot;Add Dialogue Line&quot; to add one.
              </p>
            ) : (
              <div className="space-y-2.5">
                {scene.dialogues.map((dialogue, idx) => (
                  <DialogueEditor
                    key={idx}
                    dialogue={dialogue}
                    index={idx}
                    onChange={(updated) => handleDialogueChange(idx, updated)}
                    onDelete={() => handleDeleteDialogue(idx)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
