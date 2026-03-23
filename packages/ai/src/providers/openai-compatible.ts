import type { ProviderConfig } from "../types.js";
import { OpenAIProvider } from "./openai.js";

export class OpenAICompatibleProvider extends OpenAIProvider {
  override readonly name = "openai-compatible";

  constructor(config: ProviderConfig) {
    super(config);
  }
}
