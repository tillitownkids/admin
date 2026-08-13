import { NextRequest, NextResponse } from 'next/server';
import { BedrockService } from '@/lib/services/ai/BedrockService';
import { AITaskFactory } from '@/lib/services/ai/AITaskFactory';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskType, content } = body;

    if (!taskType || !content) {
      return NextResponse.json({ error: 'Missing taskType or content' }, { status: 400 });
    }

    const bedrockService = new BedrockService();
    const task = AITaskFactory.getTask(taskType, bedrockService);
    
    const result = await task.execute(content);

    return NextResponse.json({ result });
  } catch (error: any) {
    // Log the error internally, but don't leak secrets in the response
    console.error("AI Execute Route Error:", error);
    
    return NextResponse.json(
      { error: error.message || 'An error occurred during AI execution' },
      { status: 500 }
    );
  }
}
