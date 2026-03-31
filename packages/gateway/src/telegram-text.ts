export const TELEGRAM_MAX_TEXT_LENGTH = 4096;

export function splitTelegramMessage(
  text: string,
  limit: number = TELEGRAM_MAX_TEXT_LENGTH,
): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit);
    const splitAt = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    const cut = splitAt > 0 ? splitAt : limit;
    const chunk = remaining.slice(0, cut).trimEnd();
    chunks.push(chunk.length > 0 ? chunk : remaining.slice(0, limit));
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
