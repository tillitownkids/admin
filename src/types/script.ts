export interface DialogueLine {
  character: string;
  line: string;
}

export interface Scene {
  sceneNumber: number;
  setting: string;
  narration: string;
  dialogues: DialogueLine[];
}

export interface ScriptContent {
  recap: string;
  scenes: Scene[];
}
