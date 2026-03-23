import type {
  ChatChunk,
  ChatOptions,
  ChatResponse,
  LLMConfig,
  LLMProvider,
  Message,
} from "./types.js";
import { ProviderRegistry } from "./registry.js";
import { ConfigLoader } from "./config.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { GoogleProvider } from "./providers/google.js";
import { OpenAICompatibleProvider } from "./providers/openai-compatible.js";

/**
 * AIClient — 门面类
 *
 * 封装 Provider 选择、运行时切换和配置加载，对外暴露统一的 chat / chatStream 接口。
 */
export class AIClient {
  private currentProvider: LLMProvider;
  private readonly registry: ProviderRegistry;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.registry = new ProviderRegistry();

    // 预注册四种内置 Provider
    this.registry.register("openai", (c) => new OpenAIProvider(c));
    this.registry.register("anthropic", (c) => new AnthropicProvider(c));
    this.registry.register("google", (c) => new GoogleProvider(c));
    this.registry.register(
      "openai-compatible",
      (c) => new OpenAICompatibleProvider(c),
    );

    // 根据配置创建初始 Provider
    this.currentProvider = this.registry.create(config.provider, {
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
    });
  }

  /** 非流式聊天，委托给当前 Provider */
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    return this.currentProvider.chat(messages, options);
  }

  /** 流式聊天，委托给当前 Provider */
  chatStream(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncIterable<ChatChunk> {
    return this.currentProvider.chatStream(messages, options);
  }

  /** 运行时切换 Provider */
  switchProvider(providerName: string, config?: Partial<LLMConfig>): void {
    const mergedConfig: LLMConfig = {
      ...this.config,
      ...config,
      provider: providerName,
    };
    this.currentProvider = this.registry.create(providerName, {
      apiKey: mergedConfig.apiKey,
      model: mergedConfig.model,
      baseUrl: mergedConfig.baseUrl,
    });
    this.config = mergedConfig;
  }

  /** 获取当前 Provider 名称 */
  getCurrentProvider(): string {
    return this.currentProvider.name;
  }
}

/** 从配置创建 AIClient 实例 */
export function createAIClient(config: LLMConfig): AIClient {
  return new AIClient(config);
}

/** 从 YAML 配置文件创建 AIClient 实例 */
export function createAIClientFromConfig(configPath: string): AIClient {
  const config = ConfigLoader.fromYAML(configPath);
  return new AIClient(config);
}
