# win-claw

一个基于 TypeScript 与 pnpm workspace 的多包代理项目，用于构建 AI Agent、模型接入、工具能力、存储能力以及不同交互界面。

## 项目结构

这是一个 monorepo，主要包含以下包：

- `packages/agent`：Agent 循环、调度、Prompt、流式处理等核心代理逻辑
- `packages/ai`：模型客户端与多提供商适配层
- `packages/core`：通用核心能力与工具抽象
- `packages/storage`：存储层与数据库相关实现
- `packages/gateway`：网关/机器人接口相关实现
- `packages/tui`：终端交互界面
- `packages/web-ui`：Web UI 相关代码

## 技术栈

- TypeScript
- Node.js `>=22`
- pnpm workspace
- Vitest
- ESLint
- Prettier

## 环境要求

在开始之前，请确保本地环境满足以下要求：

- Node.js 22 或更高版本
- pnpm

## 安装依赖

在项目根目录执行：

```bash
pnpm install
```

## 常用脚本

### 开发

```bash
pnpm dev
```

并行启动 workspace 中各包的开发脚本。

### 构建

```bash
pnpm build
```

递归构建所有子包。

### 检查

```bash
pnpm check
```

执行：

- ESLint
- Prettier 检查
- TypeScript 类型检查

### 测试

```bash
pnpm test
```

使用 Vitest 运行测试。

### 清理

```bash
pnpm clean
```

递归执行各子包的清理脚本。

## 配置文件

项目根目录下可见以下配置文件：

- `.env`
- `.env.example`
- `config.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `vitest.config.ts`

建议优先参考 `.env.example` 补齐本地环境变量，再按需要调整 `config.yaml`。

## 开发说明

1. 先安装依赖
2. 复制并配置环境变量
3. 根据目标模块进入对应 package 开发
4. 提交前运行 `pnpm check` 与 `pnpm test`

## 目录示例

```text
win-claw/
├── packages/
│   ├── agent/
│   ├── ai/
│   ├── core/
│   ├── gateway/
│   ├── storage/
│   ├── tui/
│   └── web-ui/
├── docs/
├── data/
├── package.json
└── pnpm-workspace.yaml
```

## 备注

当前 README 基于项目现有目录结构与根脚本生成，后续可以继续补充：

- 各 package 的职责说明
- 启动方式
- 部署方式
- 配置项详解
- 架构图与调用链说明
