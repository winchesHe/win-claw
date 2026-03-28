import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { resolve } from "node:path";
import type { StorageConfig } from "./types.js";
import { EmbeddingError } from "./errors.js";

// 将模型缓存到项目 data/models 目录，避免 node_modules 重装后丢失
env.cacheDir = resolve(process.cwd(), "data/models");

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com",
};

/** 内部接口，不导出 */
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

class RemoteEmbeddingProvider implements EmbeddingProvider {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: { model: string; apiKey: string; baseUrl?: string; provider: string }) {
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URLS[config.provider] ?? "https://api.openai.com";
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
      throw new EmbeddingError(`Failed to reach embedding API: ${url}`, {
        cause,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new EmbeddingError(`Embedding API returned ${response.status}: ${body}`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw new EmbeddingError("Failed to parse embedding API response", {
        cause,
      });
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
        ? (json as { data: { embedding: unknown }[] }).data[0].embedding
        : undefined;

    if (!Array.isArray(embedding)) {
      throw new EmbeddingError(
        "Unexpected embedding API response format: missing data[0].embedding array",
      );
    }

    return embedding as number[];
  }
}

class LocalEmbeddingProvider implements EmbeddingProvider {
  private readonly model: string;
  private pipelineInstance: FeatureExtractionPipeline | null = null;
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(model: string) {
    this.model = model;
  }

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (this.pipelineInstance) return this.pipelineInstance;

    if (!this.pipelinePromise) {
      this.pipelinePromise = pipeline("feature-extraction", this.model)
        .then((p) => {
          this.pipelineInstance = p;
          return p;
        })
        .catch((err) => {
          this.pipelinePromise = null;
          throw new EmbeddingError("Failed to initialize embedding pipeline", { cause: err });
        });
    }

    return this.pipelinePromise;
  }

  async embed(text: string): Promise<number[]> {
    if (text === "") {
      return new Array(384).fill(0);
    }

    try {
      const pipe = await this.getPipeline();
      const output = await pipe(text, { pooling: "mean", normalize: true });
      return Array.from(output.data as Float32Array);
    } catch (err) {
      if (err instanceof EmbeddingError) throw err;
      throw new EmbeddingError("Embedding inference failed", { cause: err });
    }
  }
}

export class EmbeddingService {
  private readonly provider: EmbeddingProvider;

  constructor(config: StorageConfig["embedding"]) {
    if (config.provider === "local") {
      this.provider = new LocalEmbeddingProvider(config.model);
    } else {
      this.provider = new RemoteEmbeddingProvider(
        config as { model: string; apiKey: string; baseUrl?: string; provider: string },
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    return this.provider.embed(text);
  }
}
