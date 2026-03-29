# AGENTS.md

## 项目概览

`packages/tui` 是 `win-claw` monorepo 中的终端交互界面包，对外包名为 `@winches/tui`。

该包基于以下技术构建：

- TypeScript
- Node.js ESM
- React 18
- Ink 5（用于构建终端 UI）
- `tsdown`（用于打包）
- Vitest（测试框架，当前测试配置主要位于仓库根目录）

它依赖 workspace 内的以下内部包：

- `@winches/agent`
- `@winches/ai`
- `@winches/core`
- `@winches/storage`

因此在修改本包时，通常需要同时理解 monorepo 根配置以及相关内部依赖包的接口。

## Monorepo 上下文

仓库使用 `pnpm workspace` 管理多包工程，根目录 `pnpm-workspace.yaml` 中包含：

- `packages/*`

根目录常用脚本：

- 安装依赖：`pnpm install`
- 构建所有包：`pnpm build`
- 并行开发：`pnpm dev`
- 检查：`pnpm check`
- 测试：`pnpm test`
- 清理：`pnpm clean`

如果你只改动 `packages/tui`，优先使用针对该包的过滤命令，避免触发整个 workspace 的无关任务。

## 目录结构

`packages/tui` 关键结构如下：

```text
packages/tui/
├── src/
│   ├── index.ts
│   ├── app.tsx
│   ├── config.ts
│   ├── logger.ts
│   ├── types.ts
│   ├── components/
│   │   ├── ApprovalPrompt.tsx
│   │   ├── InputBox.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── MessageList.tsx
│   │   └── ToolCallCard.tsx
│   └── hooks/
│       ├── useAgent.ts
│       └── useSession.ts
├── dist/
├── data/
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

约定上：

- `src/index.ts` 是 CLI 入口
- `src/app.tsx` 是主应用 UI 组合层
- `src/components/` 存放 Ink/React 组件
- `src/hooks/` 存放状态与副作用逻辑
- `src/config.ts` 处理配置读取和解析
- `src/types.ts` 定义共享类型
- `src/logger.ts` 处理日志能力

## 环境要求

在仓库根目录工作：

- Node.js `>=22.0.0`
- pnpm

先在仓库根目录安装依赖：

```bash
pnpm install
```

如果依赖未安装完整，本包中的 workspace 依赖无法正确解析。

## 本包常用命令

以下命令建议在仓库根目录执行。

### 安装依赖

```bash
pnpm install
```

### 启动 TUI 入口

```bash
pnpm --filter @winches/tui run start
```

等价于在 `packages/tui` 目录执行：

```bash
pnpm start
```

其实际运行命令为：

```bash
tsx src/index.ts
```

### 开发模式（监听构建）

```bash
pnpm --filter @winches/tui run dev
```

其实际运行命令为：

```bash
tsdown --watch
```

注意：该命令主要用于监听打包，不等同于交互式运行 CLI。调试运行时行为时，通常需要结合 `start` 命令。

### 构建本包

```bash
pnpm --filter @winches/tui run build
```

其实际运行命令为：

```bash
tsdown
```

输出目录为：

- `packages/tui/dist`

构建产物包括：

- ESM JavaScript
- TypeScript 声明文件（`dts: true`）

### 清理构建产物

```bash
pnpm --filter @winches/tui run clean
```

### 运行根级检查

由于当前本包 `package.json` 中未定义独立 lint/typecheck 脚本，提交前至少运行根目录检查：

```bash
pnpm check
```

根脚本当前会执行：

```bash
eslint . && prettier --write . && tsc --noEmit
```

注意：这里的 Prettier 命令是 **write 模式**，会直接修改文件，不只是检查。若你在自动化流程中使用该命令，请预期工作区内容可能被格式化。

### 运行测试

仓库测试入口位于根目录：

```bash
pnpm test
```

如需仅聚焦 TUI 相关测试，可先在仓库内搜索测试文件，再按 Vitest 模式执行。当前从已检查文件中，`packages/tui` 下尚未明显看到测试文件；新增功能时应补充相应测试。

## 构建与发布信息

本包在 `package.json` 中声明：

- 包名：`@winches/tui`
- 私有包：`private: true`
- CLI 可执行文件：`winches-tui -> ./dist/index.js`
- 导出入口：`./dist/index.js`
- 类型声明：`./dist/index.d.ts`

`tsdown.config.ts` 当前配置：

- 入口：`src/index.ts`
- 格式：`esm`
- 输出目录：`dist`
- 生成类型声明：是
- `clean: true`
- `hash: false`

因此任何影响 CLI 启动行为的修改，都应至少验证：

1. `pnpm --filter @winches/tui run build` 成功
2. `pnpm --filter @winches/tui run start` 可正常启动

## TypeScript 与模块约定

本包 `tsconfig.json`：

- 继承仓库根配置：`../../tsconfig.json`
- `rootDir`: `./src`
- `outDir`: `./dist`
- `jsx`: `react-jsx`

开发时请遵守：

- 默认使用 ESM import/export
- React/Ink 组件使用 TSX
- 将可复用 UI 放在 `components/`
- 将状态逻辑、副作用、订阅逻辑放在 `hooks/`
- 共享类型优先收敛到 `types.ts` 或更明确的类型模块

## 代码风格与约定

仓库根目录存在：

- `eslint.config.js`
- `.prettierrc.json`

因此应遵循仓库统一风格，而不是在本包内引入独立风格配置。

建议：

- 不要手写与仓库风格冲突的格式
- 修改导入路径后，重新运行根级检查，确保 ESLint 和 TypeScript 都通过
- 对终端 UI 组件，优先保持渲染逻辑简洁，把复杂状态迁移到 hooks 或辅助函数
- 对配置、会话和 agent 交互逻辑，优先保持类型明确，避免 `any`

## 开发工作流建议

当你修改 `packages/tui` 时，推荐流程如下：

1. 在仓库根目录安装依赖：`pnpm install`
2. 启动 TUI 进行手动验证：`pnpm --filter @winches/tui run start`
3. 如需观察打包输出，启动监听：`pnpm --filter @winches/tui run dev`
4. 完成修改后构建本包：`pnpm --filter @winches/tui run build`
5. 在仓库根目录运行：`pnpm check`
6. 在仓库根目录运行：`pnpm test`

如果改动涉及内部依赖包接口（如 `@winches/agent`、`@winches/core`），还应同步验证相关包的构建和调用链。

## 测试说明

当前已知 devDependencies 中包含：

- `vitest`
- `fast-check`

这说明项目可能同时支持：

- 单元测试
- 属性测试

但本包当前未在已检查内容中显式提供本地测试脚本或测试文件。对本包进行修改时：

- 若新增纯函数逻辑，优先补充 Vitest 单元测试
- 若新增复杂状态转换，可考虑使用 `fast-check` 做属性测试
- 若修改 CLI/交互逻辑，至少做手动运行验证

## 调试与排查

### TUI 启不来

优先检查：

- 是否在仓库根目录执行过 `pnpm install`
- Node 版本是否满足 `>=22`
- workspace 内部依赖是否能正确解析
- `dist/` 是否由旧构建产物残留导致行为异常，可尝试：

```bash
pnpm --filter @winches/tui run clean
pnpm --filter @winches/tui run build
```

### 修改后类型错误

在仓库根目录执行：

```bash
tsc --noEmit
```

或直接：

```bash
pnpm check
```

因为本包继承根 tsconfig，很多错误会在根级类型检查中暴露。

### 修改后运行时异常

优先查看以下文件中的职责边界：

- `src/index.ts`：启动入口与进程级逻辑
- `src/app.tsx`：应用装配
- `src/hooks/useAgent.ts`：Agent 交互相关状态流
- `src/hooks/useSession.ts`：会话状态管理
- `src/config.ts`：配置读取/解析
- `src/logger.ts`：日志输出

## 对代理的具体说明

在此包中工作时，请遵守以下规则：

- 优先在 `packages/tui` 范围内最小化修改，不要无关改动其他 workspace 包
- 若必须修改跨包接口，明确说明影响范围
- 不要手动编辑 `dist/` 产物，源代码应修改 `src/`
- 完成代码变更后，至少验证构建与启动命令
- 若新增命令、配置或目录结构，请同步更新此 `AGENTS.md`

## 提交前检查清单

至少执行：

```bash
pnpm --filter @winches/tui run build
pnpm check
pnpm test
```

如果改动影响终端交互行为，再额外执行：

```bash
pnpm --filter @winches/tui run start
```

并进行手动验证。
