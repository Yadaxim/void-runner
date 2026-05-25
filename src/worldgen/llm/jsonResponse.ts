/** Strip markdown fences and parse a JSON object from an LLM response. */
export function parseJsonObject(text: string): unknown {
  let trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  if (fence) {
    trimmed = fence[1].trim();
  }
  return JSON.parse(trimmed) as unknown;
}
