'use client';

import { ScriptContent, Scene } from '@/types/script';
import { SceneEditor } from './SceneEditor';
import { Plus, BookOpen, Layers } from 'lucide-react';
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/styles';

interface ScriptEditorProps {
  value: ScriptContent;
  onChange: (updated: ScriptContent) => void;
}

export function ScriptEditor({ value, onChange }: ScriptEditorProps) {
  const handleRecapChange = (recap: string) => {
    onChange({ ...value, recap });
  };

  const handleSceneChange = (index: number, updatedScene: Scene) => {
    const updatedScenes = [...value.scenes];
    updatedScenes[index] = updatedScene;
    onChange({ ...value, scenes: updatedScenes });
  };

  const handleAddScene = () => {
    const newSceneNumber = value.scenes.length + 1;
    const newScene: Scene = {
      sceneNumber: newSceneNumber,
      setting: `INT. NEW LOCATION ${newSceneNumber} - DAY`,
      narration: '',
      dialogues: []
    };
    onChange({ ...value, scenes: [...value.scenes, newScene] });
  };

  const handleDeleteScene = (index: number) => {
    const filteredScenes = value.scenes.filter((_, i) => i !== index);
    const reindexedScenes = filteredScenes.map((sc, i) => ({ ...sc, sceneNumber: i + 1 }));
    onChange({ ...value, scenes: reindexedScenes });
  };

  return (
    <div className="space-y-6">
      {/* Recap Section */}
      <div className="p-5 rounded-2xl border border-border/60 bg-card/80 space-y-3">
        <label className={labelClass}>
          <BookOpen className="w-4 h-4 text-primary" />
          Episode Recap
        </label>
        <textarea
          value={value.recap || ''}
          onChange={(e) => handleRecapChange(e.target.value)}
          placeholder="Brief summary recap of this episode..."
          rows={3}
          className={fieldClass}
        />
      </div>

      {/* Scenes Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <h3 className="text-base font-bold text-foreground">Scenes ({value.scenes.length})</h3>
          </div>
          <button
            type="button"
            onClick={handleAddScene}
            className={`px-4 py-2 text-xs rounded-xl ${secondaryButtonClass}`}
          >
            <Plus className="w-4 h-4" />
            Add Scene
          </button>
        </div>

        {value.scenes.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-border/60 bg-card/40">
            <p className="text-sm text-muted-foreground mb-3">No scenes added yet.</p>
            <button
              type="button"
              onClick={handleAddScene}
              className={`px-4 py-2 text-xs rounded-xl ${primaryButtonClass}`}
            >
              <Plus className="w-4 h-4" />
              Add First Scene
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {value.scenes.map((scene, idx) => (
              <SceneEditor
                key={idx}
                scene={scene}
                onChange={(updated) => handleSceneChange(idx, updated)}
                onDelete={() => handleDeleteScene(idx)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
