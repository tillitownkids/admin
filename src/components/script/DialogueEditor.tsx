'use client';

import { DialogueLine } from '@/types/script';
import { Trash2, User } from 'lucide-react';
import { fieldClass, labelClass } from '@/lib/styles';

interface DialogueEditorProps {
  dialogue: DialogueLine;
  index: number;
  onChange: (updated: DialogueLine) => void;
  onDelete: () => void;
}

export function DialogueEditor({ dialogue, index, onChange, onDelete }: DialogueEditorProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-xl border border-border/50 bg-background/60">
      <div className="w-full sm:w-1/3 flex items-center gap-2">
        <User className="w-3.5 h-3.5 text-primary shrink-0" />
        <input
          type="text"
          value={dialogue.character}
          onChange={(e) => onChange({ ...dialogue, character: e.target.value })}
          placeholder="Character name"
          className={`${fieldClass} text-xs font-semibold py-1.5 px-3`}
        />
      </div>

      <div className="flex-1 w-full flex items-center gap-2">
        <input
          type="text"
          value={dialogue.line}
          onChange={(e) => onChange({ ...dialogue, line: e.target.value })}
          placeholder="Dialogue line text..."
          className={`${fieldClass} text-xs py-1.5 px-3`}
        />
        <button
          type="button"
          onClick={onDelete}
          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
          title="Delete dialogue line"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
