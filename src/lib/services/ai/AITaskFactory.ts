import { BedrockService } from './BedrockService';
import { BaseAITask } from './BaseAITask';
import { BrainstormTask } from './tasks/BrainstormTask';
import { ScriptGenerateTask } from './tasks/ScriptGenerateTask';
import { MultiEpisodeTask } from './tasks/MultiEpisodeTask';
import { AskTask } from './tasks/AskTask';
import { LocationDetectTask } from './tasks/LocationDetectTask';
import { StylesheetPromptTask } from './tasks/StylesheetPromptTask';
import { SceneDetectTask } from './tasks/SceneDetectTask';
import { StoryboardPromptTask } from './tasks/StoryboardPromptTask';
import { BeatScriptTask } from './tasks/BeatScriptTask';

export class AITaskFactory {
  static getTask(taskType: string, bedrockService: BedrockService): BaseAITask {
    switch (taskType.toLowerCase()) {
      case 'brainstorm':
        return new BrainstormTask(bedrockService);
      case 'story-generate':
      case 'story':
        return new ScriptGenerateTask(bedrockService);
      case 'multi-episode':
        return new MultiEpisodeTask(bedrockService);
      case 'ask':
        return new AskTask(bedrockService);
      case 'location-detect':
        return new LocationDetectTask(bedrockService);
      case 'stylesheet-prompt':
        return new StylesheetPromptTask(bedrockService);
      case 'scene-detect':
        return new SceneDetectTask(bedrockService);
      case 'storyboard-prompt':
        return new StoryboardPromptTask(bedrockService);
      case 'beat-script':
        return new BeatScriptTask(bedrockService);
      default:
        throw new Error(`Unknown AI task type: ${taskType}`);
    }
  }
}
