/**
 * Safely cleans, escapes control characters, and auto-repairs truncated JSON returned by AI models.
 */
export function parseAiJson<T = any>(rawText: string): T {
  if (!rawText || !rawText.trim()) {
    throw new Error("Empty response received from AI model.");
  }

  // 1. Extract JSON string from markdown code block or root bounds
  let jsonString = rawText.trim();
  const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    jsonString = codeBlockMatch[1].trim();
  } else {
    const firstBrace = jsonString.indexOf('{');
    const firstBracket = jsonString.indexOf('[');
    let startIdx = -1;
    if (firstBrace !== -1 && firstBracket !== -1) {
      startIdx = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
    }

    if (startIdx !== -1) {
      jsonString = jsonString.slice(startIdx).trim();
    }
  }

  // Try standard JSON.parse first
  try {
    return JSON.parse(jsonString);
  } catch {
    // Continue to character escaping and structure repair
  }

  // 2. Escape unescaped physical line breaks & control characters inside string literals
  let inString = false;
  let isEscaped = false;
  const fixedChars: string[] = [];

  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];

    if (inString) {
      if (isEscaped) {
        fixedChars.push(char);
        isEscaped = false;
      } else if (char === '\\') {
        fixedChars.push(char);
        isEscaped = true;
      } else if (char === '"') {
        fixedChars.push(char);
        inString = false;
      } else if (char === '\n') {
        fixedChars.push('\\n');
      } else if (char === '\r') {
        fixedChars.push('\\r');
      } else if (char === '\t') {
        fixedChars.push('\\t');
      } else {
        fixedChars.push(char);
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      fixedChars.push(char);
    }
  }

  let cleaned = fixedChars.join('');

  // Try parsing after control character escaping
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to truncation repair
  }

  // 3. Repair truncated JSON (unclosed strings, trailing commas, open brackets/braces)
  const stack: string[] = [];
  let stringMode = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (stringMode) {
      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === '"') {
        stringMode = false;
      }
    } else {
      if (c === '"') {
        stringMode = true;
      } else if (c === '{' || c === '[') {
        stack.push(c);
      } else if (c === '}') {
        if (stack.length && stack[stack.length - 1] === '{') stack.pop();
      } else if (c === ']') {
        if (stack.length && stack[stack.length - 1] === '[') stack.pop();
      }
    }
  }

  // If stuck inside an unclosed string at the end, close it
  if (stringMode) {
    cleaned += '"';
  }

  // Remove trailing commas before closing brackets/braces
  cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');

  // Close unclosed braces/brackets in reverse order
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') cleaned += '}';
    if (last === '[') cleaned += ']';
  }

  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    console.error("AI JSON parse repair failed. Tail snippet:", cleaned.slice(-300));
    throw new Error(`AI JSON parse error: ${err.message}`);
  }
}
