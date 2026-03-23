# 实施计划：Monorepo 脚手架初始化

## 概述

基于需求和设计文档，将 winches-agent monorepo 脚手架的文件生成拆分为增量式编码任务。每个任务生成一组相关配置文件，后续任务在前序任务基础上递进。最终通过属性测试和单元测试验证所有产物的正确性。

## 任务列表

- [x] 1. 创建根目录配置文件
  - [x] 1.1 创建根 package.json
    - 创建 `package.json`，包含 `name`、`version`、`private`、`type`、`workspaces`、`engines`、`scripts` 字段
    - scripts 包含 `build`、`check`、`test`、`clean` 四个命令
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - [x] 1.2 创建根 tsconfig.json
    - 创建共享 TypeScript 配置，启用 `strict`、`declaration`、`declarationMap`、`sourceMap`
    - 设置 `module: "NodeNext"`、`target: "ES2022"`、`resolveJsonModule` 等选项
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7_
  - [x] 1.3 创建 ESLint flat config 配置
    - 创建 `eslint.config.js`，集成 `@eslint/js`、`typescript-eslint`、`eslint-config-prettier`
    - 配置 ignores 排除 `dist/`、`coverage/`、`node_modules/`
    - _需求: 4.1, 4.3, 4.4_
  - [x] 1.4 创建 Prettier 配置
    - 创建 `.prettierrc.json` 定义格式化规则
    - 创建 `.prettierignore` 排除 `dist/`、`coverage/`、`node_modules/`、`data/`
    - _需求: 4.2, 4.5_
  - [x] 1.5 创建 Vitest 配置
    - 创建 `vitest.config.ts`，配置 include 模式匹配所有子包测试文件
    - 配置 coverage 输出目录为 `coverage/`
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [x] 1.6 创建 .gitignore
    - 排除 `node_modules/`、`dist/`、`coverage/`、`.env`、`.env.*`、`data/`、`*.tsbuildinfo`
    - _需求: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 2. 创建 7 个子包骨架目录
  - [x] 2.1 创建子包目录结构和 package.json
    - 为 ai、core、storage、agent、tui、web-ui、gateway 创建 `packages/<包名>/` 目录
    - 每个子包生成 `package.json`，包名格式 `@winches/<包名>`，配置 `type`、`exports`、`files`、`scripts`
    - _需求: 6.1, 6.2, 6.6, 6.7, 6.8_
  - [x] 2.2 创建子包 tsconfig.json
    - 每个子包生成 `tsconfig.json`，通过 `extends: "../../tsconfig.json"` 继承根配置
    - 设置 `outDir: "./dist"` 和 `rootDir: "./src"`
    - _需求: 2.6, 6.3_
  - [x] 2.3 创建子包 tsdown.config.ts
    - 每个子包生成 `tsdown.config.ts`，配置 `format: "esm"`、`outDir: "dist"`、`dts: true`、`clean: true`
    - _需求: 3.1, 3.2, 3.3, 3.4_
  - [x] 2.4 创建子包 README.md 和 src/index.ts
    - 每个子包生成 `README.md`，包含 `@winches/<包名>` 和简要描述
    - 每个子包创建 `src/index.ts` 入口文件
    - _需求: 6.4, 6.5_

- [x] 3. 创建运维和部署文件
  - [x] 3.1 创建 config.yaml 配置模板
    - 包含 llm、embedding、telegram、approval、storage、logging 配置段
    - 使用 `${ENV_VAR}` 语法标注环境变量引用字段
    - 每个配置项附带注释说明用途和可选值
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_
  - [x] 3.2 创建 Dockerfile
    - 使用 `node:22-slim` 基础镜像，采用多阶段构建
    - 构建阶段：安装依赖并执行构建
    - 运行阶段：仅复制构建产物和运行时文件
    - 包含注释说明各阶段用途
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 4. 检查点 - 验证脚手架文件完整性
  - 确保所有文件已正确生成，目录结构符合设计文档，如有疑问请向用户确认。

- [x] 5. 编写测试
  - [x] 5.1 创建测试目录和测试基础设施
    - 创建 `tests/` 目录
    - 确保 vitest 和 fast-check 已在根 package.json 的 devDependencies 中声明
    - _需求: 5.1, 5.2_
  - [ ]* 5.2 编写根配置文件单元测试
    - 在 `tests/scaffold.test.ts` 中验证根 package.json 字段（private、workspaces、type、engines、scripts）
    - 验证根 tsconfig.json 编译选项（strict、module、target、declaration 等）
    - 验证 ESLint 配置文件存在性和 TypeScript/Prettier 集成
    - 验证 Prettier 配置和 .prettierignore 内容
    - 验证 Vitest 配置（include 模式、coverage 目录）
    - 验证 .gitignore 排除规则完整性
    - _需求: 1.1-1.7, 2.1-2.5, 2.7, 4.1-4.5, 5.1-5.5, 9.1-9.6_
  - [ ]* 5.3 编写运维文件单元测试
    - 在 `tests/scaffold.test.ts` 中验证 config.yaml 各配置段存在性和环境变量语法
    - 验证 Dockerfile 多阶段构建结构
    - _需求: 7.1-7.9, 8.1-8.6_
  - [ ]* 5.4 编写属性测试 - Property 1: 子包目录结构完整性
    - 在 `tests/scaffold.property.test.ts` 中使用 fast-check
    - **Property 1: 子包目录结构完整性**
    - 遍历所有子包名称，验证 `packages/<包名>/` 下存在 package.json、tsconfig.json、tsdown.config.ts、README.md、src/index.ts
    - **验证: 需求 6.1, 6.2, 6.3, 6.4, 6.5, 3.1**
  - [ ]* 5.5 编写属性测试 - Property 2: 子包 package.json 规范性
    - **Property 2: 子包 package.json 规范性**
    - 遍历所有子包，验证 name 格式为 `@winches/<包名>`、type 为 module、exports 指向 dist/、files 仅含 dist/
    - **验证: 需求 6.2, 6.6, 6.7, 6.8**
  - [ ]* 5.6 编写属性测试 - Property 3: 子包 tsconfig 继承正确性
    - **Property 3: 子包 tsconfig 继承正确性**
    - 遍历所有子包，验证 tsconfig.json 的 extends 字段值为 `"../../tsconfig.json"`
    - **验证: 需求 2.6, 6.3**
  - [ ]* 5.7 编写属性测试 - Property 4: 子包 tsdown 构建配置一致性
    - **Property 4: 子包 tsdown 构建配置一致性**
    - 遍历所有子包，验证 tsdown.config.ts 配置 format 为 esm、outDir 为 dist、dts 为 true
    - **验证: 需求 3.2, 3.3, 3.4**
  - [ ]* 5.8 编写属性测试 - Property 5: 子包 README 包含包名
    - **Property 5: 子包 README 包含包名**
    - 遍历所有子包，验证 README.md 内容包含 `@winches/<包名>`
    - **验证: 需求 6.4**

- [x] 6. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- 属性测试验证跨所有子包的通用正确性属性
- 单元测试验证具体配置文件的内容和边界情况
- 检查点任务确保增量验证
