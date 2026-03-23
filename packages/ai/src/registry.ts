import type { LLMProvider, ProviderConfig } from "./types.js";
import { AIError } from "./errors.js";

/** Provider 工厂函数类型 */
export type ProviderFactory = (config: ProviderConfig) => LLMProvider;

/** Provider 工厂注册中心 */
export class ProviderRegistry {
  private factories = new Map<string, ProviderFactory>();

  /** 注册 Provider 工厂 */
  register(name: string, factory: ProviderFactory): void {
    this.factories.set(name, factory);
  }

  /** 创建 Provider 实例 */
  create(name: string, config: ProviderConfig): LLMProvider {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new AIError(`Provider "${name}" is not registered`);
    }
    return factory(config);
  }

  /** 检查 Provider 是否已注册 */
  has(name: string): boolean {
    return this.factories.has(name);
  }
}
