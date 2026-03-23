# 需求文档：Monorepo 脚手架初始化

## 简介

本需求定义 winches-agent 项目的 Monorepo 脚手架初始化功能。winches-agent 是一个个人 7×24 小时 Agent 助手平台，采用 npm workspaces monorepo 架构，使用 TypeScript strict mode + ESM 模块系统。本子项目负责搭建整个 monorepo 的基础结构，包括根配置、构建工具链、代码规范、测试框架以及 7 个子包的空骨架目录。

## 术语表

- **Root_Package**: 项目根目录的 package.json，负责 npm workspaces 配置和全局 npm scripts
- **Workspace**: npm workspaces 机制管理的子包集合，位于 `packages/` 目录下
- **Sub_Package**: Workspace 中的单个子包，scope 为 `@winches/*`
- **Shared_TSConfig**: 根目录的 tsconfig.json，定义所有子包共享的 TypeScript 编译选项
- **Build_System**: 基于 tsdown（Rolldown）的构建工具链
- **Lint_System**: 基于 ESLint + Prettier 的代码规范检查和格式化工具链
- **Test_System**: 基于 Vitest 的测试框架
- **Config_Template**: 根目录的 config.yaml 模板文件，定义项目运行时配置结构
- **Scaffold_CLI**: 执行脚手架初始化的过程（通过 npm scripts 或手动操作）

## 需求

### 需求 1：根目录 package.json 配置

**用户故事：** 作为开发者，我希望项目根目录有一个正确配置的 package.json，以便通过 npm workspaces 统一管理所有子包。

#### 验收标准

1. THE Root_Package SHALL 声明 `"private": true` 以防止根包被意外发布
2. THE Root_Package SHALL 在 `workspaces` 字段中配置 `["packages/*"]` 以启用 npm workspaces
3. THE Root_Package SHALL 定义 `build` 脚本，用于构建所有子包
4. THE Root_Package SHALL 定义 `check` 脚本，依次执行 lint 检查、格式化检查和 TypeScript 类型检查
5. THE Root_Package SHALL 定义 `test` 脚本，用于运行所有子包的测试
6. THE Root_Package SHALL 指定 `"type": "module"` 以启用 ESM 模块系统
7. THE Root_Package SHALL 在 `engines` 字段中指定所需的 Node.js 最低版本

### 需求 2：共享 TypeScript 配置

**用户故事：** 作为开发者，我希望有一个共享的 TypeScript 配置，以便所有子包使用一致的编译选项，减少重复配置。

#### 验收标准

1. THE Shared_TSConfig SHALL 启用 `strict` 模式以确保类型安全
2. THE Shared_TSConfig SHALL 将 `module` 设置为 ESM 兼容的模块系统（如 `"NodeNext"`）
3. THE Shared_TSConfig SHALL 将 `target` 设置为现代 JavaScript 版本（如 `"ES2022"` 或更高）
4. THE Shared_TSConfig SHALL 启用 `declaration` 以生成类型声明文件
5. THE Shared_TSConfig SHALL 启用 `declarationMap` 和 `sourceMap` 以支持调试和源码映射
6. WHEN Sub_Package 的 tsconfig.json 引用 Shared_TSConfig 时，THE Sub_Package SHALL 通过 `extends` 字段继承共享配置
7. THE Shared_TSConfig SHALL 启用 `resolveJsonModule` 以支持导入 JSON 文件

### 需求 3：tsdown 构建配置

**用户故事：** 作为开发者，我希望有统一的 tsdown 构建配置，以便所有子包使用一致的构建流程输出 ESM 格式产物。

#### 验收标准

1. THE Build_System SHALL 在每个 Sub_Package 中提供 tsdown 配置文件
2. THE Build_System SHALL 将输出格式配置为 ESM
3. THE Build_System SHALL 将构建产物输出到每个 Sub_Package 的 `dist/` 目录
4. THE Build_System SHALL 生成对应的类型声明文件（`.d.ts`）
5. WHEN 执行根目录的 `build` 脚本时，THE Build_System SHALL 按依赖顺序构建所有子包

### 需求 4：ESLint + Prettier 配置

**用户故事：** 作为开发者，我希望有统一的代码规范配置，以便团队保持一致的代码风格和质量标准。

#### 验收标准

1. THE Lint_System SHALL 在根目录提供 ESLint 配置文件，适用于所有子包
2. THE Lint_System SHALL 在根目录提供 Prettier 配置文件，定义统一的代码格式化规则
3. THE Lint_System SHALL 配置 ESLint 支持 TypeScript 文件的语法检查
4. THE Lint_System SHALL 配置 ESLint 与 Prettier 协同工作，避免规则冲突
5. THE Lint_System SHALL 提供 `.prettierignore` 文件，排除 `dist/`、`node_modules/` 等生成目录
6. WHEN 执行 `check` 脚本时，THE Lint_System SHALL 依次运行 ESLint 检查和 Prettier 格式化检查

### 需求 5：Vitest 测试配置

**用户故事：** 作为开发者，我希望有统一的 Vitest 测试配置，以便在所有子包中编写和运行测试。

#### 验收标准

1. THE Test_System SHALL 在根目录提供 Vitest 配置文件
2. THE Test_System SHALL 配置 Vitest 支持 TypeScript 文件
3. THE Test_System SHALL 将测试文件匹配模式配置为 `**/*.test.ts` 或 `**/*.spec.ts`
4. WHEN 执行根目录的 `test` 脚本时，THE Test_System SHALL 运行所有子包中的测试文件
5. THE Test_System SHALL 配置覆盖率报告输出目录为 `coverage/`

### 需求 6：子包骨架目录结构

**用户故事：** 作为开发者，我希望 7 个子包都有统一的骨架目录结构，以便快速开始各包的开发工作。

#### 验收标准

1. THE Scaffold_CLI SHALL 在 `packages/` 目录下创建以下 7 个子包目录：`ai`、`core`、`storage`、`agent`、`tui`、`web-ui`、`gateway`
2. WHEN 创建 Sub_Package 时，THE Scaffold_CLI SHALL 为每个子包生成 `package.json`，包名格式为 `@winches/<包名>`
3. WHEN 创建 Sub_Package 时，THE Scaffold_CLI SHALL 为每个子包生成 `tsconfig.json`，通过 `extends` 继承 Shared_TSConfig
4. WHEN 创建 Sub_Package 时，THE Scaffold_CLI SHALL 为每个子包生成 `README.md`，包含包名和简要描述
5. WHEN 创建 Sub_Package 时，THE Scaffold_CLI SHALL 为每个子包创建 `src/` 目录，并包含一个 `index.ts` 入口文件
6. THE Sub_Package 的 package.json SHALL 声明 `"type": "module"` 以启用 ESM
7. THE Sub_Package 的 package.json SHALL 在 `exports` 字段中正确配置入口点，指向构建产物
8. THE Sub_Package 的 package.json SHALL 在 `files` 字段中仅包含 `dist/` 目录

### 需求 7：config.yaml 配置模板

**用户故事：** 作为开发者，我希望有一个 config.yaml 模板文件，以便了解项目运行时所需的配置结构。

#### 验收标准

1. THE Config_Template SHALL 位于项目根目录，文件名为 `config.yaml`
2. THE Config_Template SHALL 包含 LLM provider 配置段（provider、model、apiKey、baseUrl）
3. THE Config_Template SHALL 包含 embedding 配置段（provider、model）
4. THE Config_Template SHALL 包含 Telegram Bot 配置段（botToken）
5. THE Config_Template SHALL 包含审批超时配置段（timeout、defaultAction）
6. THE Config_Template SHALL 包含存储路径配置段（dbPath）
7. THE Config_Template SHALL 包含日志级别配置段（level）
8. THE Config_Template SHALL 使用 `${ENV_VAR}` 语法标注支持环境变量引用的字段
9. THE Config_Template SHALL 为每个配置项提供注释说明其用途和可选值

### 需求 8：Dockerfile 骨架

**用户故事：** 作为开发者，我希望有一个 Dockerfile 骨架，以便后续快速实现容器化部署。

#### 验收标准

1. THE Dockerfile SHALL 位于项目根目录
2. THE Dockerfile SHALL 使用 Node.js 官方镜像作为基础镜像
3. THE Dockerfile SHALL 采用多阶段构建，分离构建阶段和运行阶段
4. THE Dockerfile SHALL 在构建阶段安装依赖并执行构建
5. THE Dockerfile SHALL 在运行阶段仅复制构建产物和必要的运行时文件
6. THE Dockerfile SHALL 包含注释说明各阶段的用途，方便后续扩展

### 需求 9：项目忽略文件配置

**用户故事：** 作为开发者，我希望有正确的 .gitignore 配置，以便版本控制中排除生成文件和敏感信息。

#### 验收标准

1. THE Root_Package SHALL 在根目录提供 `.gitignore` 文件
2. THE `.gitignore` SHALL 排除 `node_modules/` 目录
3. THE `.gitignore` SHALL 排除所有子包的 `dist/` 构建产物目录
4. THE `.gitignore` SHALL 排除 `coverage/` 测试覆盖率目录
5. THE `.gitignore` SHALL 排除 `.env` 等环境变量文件以保护敏感信息
6. THE `.gitignore` SHALL 排除 `data/` 目录（SQLite 数据库运行时数据）
