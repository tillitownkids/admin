import { BedrockService } from './BedrockService';

export abstract class BaseAITask {
  protected bedrockService: BedrockService;

  constructor(bedrockService: BedrockService) {
    this.bedrockService = bedrockService;
  }

  /**
   * Helper to build the prompt for the task. Must be overridden by subclass.
   */
  abstract buildPrompt(input: any): string;

  /**
   * Executes the task. Must be overridden by subclass.
   */
  abstract execute(input: any): Promise<any>;
}
