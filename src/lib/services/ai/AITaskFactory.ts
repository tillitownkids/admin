import { BedrockService } from './BedrockService';
import { BaseAITask } from './BaseAITask';
import { BrainstormTask } from './tasks/BrainstormTask';
import { ScriptGenerateTask } from './tasks/ScriptGenerateTask';
import { MultiEpisodeTask } from './tasks/MultiEpisodeTask';
import { AskTask } from './tasks/AskTask';

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
      default:
        throw new Error(`Unknown AI task type: ${taskType}`);
    }
  }
}
