# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Missing Required Params & Lost ToolCalls
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate both bugs exist
  - **Scoped PBT Approach**: Scope the property to concrete failing cases for reproducibility
  - Bug 1 — Parameter Validation:
    - Create a mock tool with `parameters.required: ["dirPath"]` and a spy `execute`
    - Call `executeToolCall` with `arguments: "{}"` (valid JSON, missing required param)
    - Assert `result.toolResult.success === false`
    - Assert `result.toolResult.error` contains `"dirPath"` (the missing param name)
    - Assert `tool.execute` was NOT called
    - On UNFIXED code: `tool.execute` IS called with undefined params → test FAILS (confirms bug)
  - Bug 2 — Assistant ToolCalls Conversion:
    - Instantiate `OpenAIProvider` and call `toOpenAIMessages` with an assistant message containing `toolCalls: [{ id: "call_1", name: "file.list", arguments: "{}" }]`
    - Assert the output assistant message has `tool_calls` array with matching `id`, `function.name`, `function.arguments`
    - On UNFIXED code: `tool_calls` is missing from output → test FAILS (confirms bug)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves both bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failure is documented
  - _Requirements: 1.1, 1.4, 2.1, 2.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Valid Params Execute & Plain Messages Convert
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Observe: `executeToolCall` with all required params present → `tool.execute` is called with parsed params
    - Observe: `executeToolCall` with invalid JSON → returns `Invalid JSON arguments` error
    - Observe: `toOpenAIMessages` with plain assistant message (no toolCalls) → produces `{ role: "assistant", content }` without `tool_calls`
    - Observe: `toOpenAIMessages` with tool message → produces `{ role: "tool", content, tool_call_id }` correctly
  - Write property-based tests capturing observed behavior:
    - Generate random tool calls where all `required` fields are present in params → assert `tool.execute` is called with correct params, result passes through
    - Generate random assistant messages WITHOUT toolCalls → assert `toOpenAIMessages` output has no `tool_calls` field
    - Generate random tool messages with `toolCallId` → assert `toOpenAIMessages` output preserves `tool_call_id` and content
    - Generate random invalid JSON strings → assert `executeToolCall` returns `Invalid JSON arguments` error
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for missing required parameter validation and lost assistant toolCalls

  - [x] 3.1 Add `toolCalls` optional field to `Message` interface
    - In `packages/ai/src/types.ts`, add `toolCalls?: ToolCall[]` to the `Message` interface
    - This enables type-safe propagation of tool calls on assistant messages
    - _Requirements: 2.3_

  - [x] 3.2 Add required parameter validation in `executeToolCall`
    - In `packages/agent/src/dispatch.ts`, after JSON parse succeeds (step 2) and before approval (step 3):
    - Read `tool.parameters.required` array (default to `[]` if absent)
    - Check each required field exists in parsed `params` (not `undefined` and not `null`)
    - If any missing, return `{ toolResult: { success: false, error: 'Missing required parameter "fieldName" for tool "toolName"' }, rejected: false }`
    - Do NOT call `tool.execute` when validation fails
    - _Bug_Condition: isBugCondition_ParameterValidation(toolCall, tool) where JSON parses OK but required fields missing_
    - _Expected_Behavior: Return clear error naming missing param(s), do not invoke tool.execute_
    - _Preservation: Valid params with all required fields must continue to pass through to tool.execute unchanged_
    - _Requirements: 2.1, 2.2, 3.1_

  - [x] 3.3 Handle assistant toolCalls in `toOpenAIMessages`
    - In `packages/ai/src/providers/openai.ts`, update the `case "assistant"` branch of `toOpenAIMessages`:
    - Check if `msg.toolCalls` exists and is non-empty
    - If so, map each `ToolCall` to `{ type: "function", id: tc.id, function: { name: tc.name, arguments: tc.arguments } }` and include as `tool_calls` on the returned object
    - If `msg.toolCalls` is absent or empty, return the same output as before (no `tool_calls` field)
    - _Bug_Condition: isBugCondition_MissingToolCalls(message) where assistant message has toolCalls_
    - _Expected_Behavior: Output includes tool_calls array with correct id, function.name, function.arguments_
    - _Preservation: Plain assistant messages without toolCalls must produce identical output as before_
    - _Requirements: 2.4, 3.2_

  - [x] 3.4 Remove `as Message` type assertion in `loop.ts`
    - In `packages/agent/src/loop.ts`, replace `{ role: "assistant", content: content || "", toolCalls } as Message` with `{ role: "assistant", content: content || "", toolCalls }` (no assertion needed after Message type update)
    - _Requirements: 2.3_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Missing Required Params & Lost ToolCalls
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms both bugs are fixed)
    - _Requirements: 2.1, 2.4_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Valid Params Execute & Plain Messages Convert
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to confirm no regressions
  - Ensure all property-based tests and unit tests pass
  - Ask the user if questions arise
