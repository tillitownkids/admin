import { GoogleGenAI } from '@google/genai';

export interface GeminiReferenceImage {
  mimeType: string;
  data: string; // base64
}

export interface GeminiImageResult {
  base64: string;
  mimeType: string;
}

export class GeminiImageService {
  private client: GoogleGenAI;
  private modelId: string;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    this.modelId = process.env.GEMINI_IMAGE_MODEL_ID || 'gemini-2.5-flash-image';
  }

  async generateImage(params: {
    prompt: string;
    referenceImages?: GeminiReferenceImage[];
  }): Promise<GeminiImageResult> {
    const { prompt, referenceImages = [] } = params;

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt },
    ];
    for (const ref of referenceImages) {
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
    }

    const response = await this.client.models.generateContent({
      model: this.modelId,
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const candidateParts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = candidateParts.find((p) => p.inlineData?.data);

    if (!imagePart?.inlineData?.data) {
      throw new Error('Gemini did not return image data for this prompt.');
    }

    return {
      base64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
    };
  }
}
