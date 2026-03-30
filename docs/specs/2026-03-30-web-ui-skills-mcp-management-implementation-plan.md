# Web UI Skills And MCP Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 1 read-only Skills and MCP management pages to `@winches/web-ui`, backed by discovery APIs that explain active entries, sources, and shadowing.

**Architecture:** Extend the existing Hono server with plugin discovery routes and view models, using `@winches/core` plugin discovery semantics as the source of truth. Add two React pages in the existing SPA shell, reusing current layout, API helpers, and table/detail interaction patterns.

**Tech Stack:** TypeScript, React, react-router-dom, Hono, Vitest, pnpm workspaces

---

## File Structure

- Modify: `packages/web-ui/src/server/types.ts`
  - Add Skills/MCP view models returned by new plugin routes.
- Create: `packages/web-ui/src/server/services/plugin-discovery-service.ts`
  - Discover skills and MCP sources, compute active items and shadowed entries, and merge MCP runtime status when available.
- Create: `packages/web-ui/src/server/routes/plugins.ts`
  - Expose read-only plugin APIs for skills, MCP, and source metadata.
- Modify: `packages/web-ui/src/server/index.ts`
  - Register the new plugin routes and wire the service.
- Modify: `packages/web-ui/src/client/App.tsx`
  - Register `/skills` and `/mcp` routes.
- Modify: `packages/web-ui/src/client/components/Sidebar.tsx`
  - Add navigation entries for Skills and MCP.
- Create: `packages/web-ui/src/client/pages/Skills.tsx`
  - Render the read-only Skills page with list and details.
- Create: `packages/web-ui/src/client/pages/Mcp.tsx`
  - Render the read-only MCP page with list and details.
- Modify: `packages/web-ui/src/client/styles.css`
  - Add page styles shared by the new plugin management views.
- Create: `packages/web-ui/src/__tests__/plugins-route.test.ts`
  - Verify the new read-only plugin route payloads and source/shadowing behavior.

## Chunk 1: Backend Discovery API

### Task 1: Add plugin view models

**Files:**

- Modify: `packages/web-ui/src/server/types.ts`
- Test: `packages/web-ui/src/__tests__/plugins-route.test.ts`

- [ ] **Step 1: Add Skill and MCP response types to server types**

Define response models for:

```ts
export interface SkillSourceView {
  /* ... */
}
export interface SkillListItemView {
  /* ... */
}
export interface SkillDetailView {
  /* ... */
}
export interface McpSourceView {
  /* ... */
}
export interface McpListItemView {
  /* ... */
}
export interface McpDetailView {
  /* ... */
}
export interface PluginSourceSummaryView {
  /* ... */
}
export interface PluginSourcesResponse {
  /* ... */
}
```

- [ ] **Step 2: Run typecheck for the web-ui package to catch definition issues**

Run: `pnpm check:types --filter @winches/web-ui`
Expected: command succeeds or reports only unrelated pre-existing errors

### Task 2: Implement plugin discovery service

**Files:**

- Create: `packages/web-ui/src/server/services/plugin-discovery-service.ts`
- Modify: `packages/web-ui/src/server/types.ts`
- Test: `packages/web-ui/src/__tests__/plugins-route.test.ts`

- [ ] **Step 1: Implement source scanning helpers**

Write helpers that scan project/global plugin sources using the same path conventions as `@winches/core`, keeping enough metadata to show shadowed entries.

- [ ] **Step 2: Implement Skills aggregation**

Group skill definitions by name, compute active and shadowed entries, attach editability flags, and build list/detail view models.

- [ ] **Step 3: Implement MCP aggregation**

Group MCP server definitions by name, compute active and shadowed entries, and attach runtime status as `unknown` when no status provider is present.

- [ ] **Step 4: Implement plugin source summary output**

Return a summarized list of discovered scopes and writable targets, defaulting to project `/.codex/` targets for future write flows.

- [ ] **Step 5: Write focused route-level expectations in tests**

Cover cases for:

```ts
// project skill shadows global skill
// project mcp shadows yaml/global entry
// missing runtime status yields "unknown"
```

- [ ] **Step 6: Run the new test file and confirm it passes**

Run: `pnpm vitest run packages/web-ui/src/__tests__/plugins-route.test.ts`
Expected: PASS

### Task 3: Expose plugin routes

**Files:**

- Create: `packages/web-ui/src/server/routes/plugins.ts`
- Modify: `packages/web-ui/src/server/index.ts`
- Test: `packages/web-ui/src/__tests__/plugins-route.test.ts`

- [ ] **Step 1: Add read-only plugin routes**

Implement:

```ts
GET /api/plugins/skills
GET /api/plugins/skills/:name
GET /api/plugins/mcp
GET /api/plugins/mcp/:name
GET /api/plugins/sources
```

- [ ] **Step 2: Wire the routes into the app factory**

Instantiate the plugin discovery service in `createApp()` and register the route group.

- [ ] **Step 3: Run the route test suite again**

Run: `pnpm vitest run packages/web-ui/src/__tests__/plugins-route.test.ts`
Expected: PASS

## Chunk 2: Frontend Read-Only Pages

### Task 4: Add Skills page

**Files:**

- Create: `packages/web-ui/src/client/pages/Skills.tsx`
- Modify: `packages/web-ui/src/client/App.tsx`
- Modify: `packages/web-ui/src/client/components/Sidebar.tsx`
- Modify: `packages/web-ui/src/client/styles.css`

- [ ] **Step 1: Add route and sidebar entry for Skills**

Register `/skills` in the router and add the navigation item.

- [ ] **Step 2: Implement the Skills page**

Build a read-only page that fetches `/plugins/skills`, supports selection, and fetches `/plugins/skills/:name` for details.

- [ ] **Step 3: Add page states and empty/error handling**

Support loading, empty, error, and selected-detail states.

- [ ] **Step 4: Add the shared plugin page styles**

Style the list/detail layout in a way consistent with existing sessions/config pages.

### Task 5: Add MCP page

**Files:**

- Create: `packages/web-ui/src/client/pages/Mcp.tsx`
- Modify: `packages/web-ui/src/client/App.tsx`
- Modify: `packages/web-ui/src/client/components/Sidebar.tsx`
- Modify: `packages/web-ui/src/client/styles.css`

- [ ] **Step 1: Add route and sidebar entry for MCP**

Register `/mcp` in the router and add the navigation item.

- [ ] **Step 2: Implement the MCP page**

Build a read-only page that fetches `/plugins/mcp`, supports selection, and fetches `/plugins/mcp/:name` for details.

- [ ] **Step 3: Add status rendering and source details**

Show transport, source, tool count, runtime status, and shadowed sources.

- [ ] **Step 4: Reuse and refine shared plugin styles**

Ensure desktop and mobile layouts remain usable.

## Chunk 3: Verification

### Task 6: Verify backend and frontend integration

**Files:**

- Test: `packages/web-ui/src/__tests__/plugins-route.test.ts`

- [ ] **Step 1: Run targeted web-ui tests**

Run: `pnpm vitest run packages/web-ui/src/__tests__/plugins-route.test.ts packages/web-ui/src/__tests__/status-route.test.ts packages/web-ui/src/__tests__/config-route.test.ts`
Expected: PASS

- [ ] **Step 2: Run web-ui typecheck**

Run: `pnpm check:types --filter @winches/web-ui`
Expected: PASS

- [ ] **Step 3: Summarize residual risks before moving to Phase 2**

Document any known limitations, especially:

```text
- read-only only, no editing yet
- runtime MCP status may be unknown unless explicit status source is injected
- source scanning logic is intentionally aligned to current core discovery semantics
```
