import type { StorageConfig } from "./types.js";
import { EmbeddingError } from "./errors.js";

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com",
};

export class EmbeddingService {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: StorageConfig["embedding"]) {
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.baseUrl =
      config.baseUrl ?? DEFAULT_BASE_URLS[config.provider] ?? "https://api.openai.com";
  }

  async embed(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/v1/embeddings`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: text }),
      });
    } catch (cause) {
      throw new EmbeddingError(`Failed to reach embedding API: ${url}`, { cause });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new EmbeddingError(
        `Embedding API returned ${response.status}: ${body}`,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw new EmbeddingError("Failed to parse embedding API response", { cause });
    }

    const embedding =
      json != null &&
      typeof json === "object" &&
      "data" in json &&
      Array.isArray((json as { data: unknown }).data) &&
      (json as { data: unknown[] }).data.length > 0 &&
      typeof (json as { data: unknown[] }).data[0] === "object" &&
      (json as { data: unknown[] }).data[0] != null &&
      "embedding" in ((json as { data: unknown[] }).data[0] as object)
        ? ((json as { data: { embedding: unknown }[] }).data[0].embedding)
        : undefined;

    if (!Array.isArray(embedding)) {
      throw new EmbeddingError(
        "Unexpected embedding API response format: missing data[0].embedding array",
      );
    }

    return embedding as number[];
  }
}
