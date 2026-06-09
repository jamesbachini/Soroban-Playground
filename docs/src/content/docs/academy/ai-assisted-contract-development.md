---
title: AI-Assisted Contract Development
description: Use the SoroPG AI assistant to make focused, reviewable Soroban contract changes.
---

This course teaches a controlled AI-assisted workflow for Soroban contracts. The goal is not to let the assistant rewrite everything. The goal is to use it as a focused coding partner while you keep the editor, tests, and deployment decisions under your control.

Start from a workspace that already builds or from the Hello World course material.

## Start with a clean baseline

Before asking for changes:

1. Open the workspace you want to modify.
2. Run **Test**.
3. Run **Build** if the project is ready for deployment.
4. Read any existing errors before involving the assistant.

A clean baseline matters because it tells you whether a later failure came from the AI-assisted change or from existing code.

## Ask for one narrow edit

Open **AI Assistant** from the Academy course page. Ask for a small change with a testable result.

Good prompt:

```text
Add a goodbye function that accepts a String and returns [Goodbye, name].
Update the unit tests for the new function.
Keep the existing hello function unchanged.
```

Avoid broad prompts such as "improve this contract" or "make this production ready". Broad prompts create large diffs that are harder to review and harder to test.

## Review the code before running it

After the assistant changes code, inspect the editor.

Check:

- Method names are intentional.
- Public contract methods are inside the `#[contractimpl]` block.
- SDK types are compatible with contract interfaces.
- Test expectations match the intended behavior.
- The assistant did not remove useful existing tests.

If a line is unclear, ask the assistant to explain that line rather than accepting it blindly.

## Use errors as precise prompts

If tests or build fail, copy the relevant error and ask for the smallest fix.

Useful prompt pattern:

```text
The tests fail with this error:

paste error here

I expected the goodbye function to return [Goodbye, name].
Please make the smallest code change to fix the failure.
```

The assistant is more effective when it sees the actual compiler or assertion output. Do not paraphrase technical errors unless you also include the original message.

## Ask for tests before behavior changes

For any new method, ask for a test in the same prompt or before accepting the implementation.

Good follow-up:

```text
Add a unit test for the new goodbye function.
The test should register the contract, call goodbye with a String, and assert the returned Vec.
```

Tests are the guardrail that lets you safely iterate with AI.

## Keep deploy decisions manual

Do not deploy only because the assistant says the work is finished.

Before deployment:

1. Read the final code.
2. Run tests.
3. Build the WASM.
4. Decide whether the interface is what you want.
5. Deploy only after you understand the change.

This matters more as contracts add storage, authorization, or asset logic.

## Mark the course complete

Return to Academy after you have:

- Asked for one narrow contract edit.
- Reviewed the resulting code.
- Run tests.
- Used at least one test or compiler error as a follow-up prompt, or confirmed the first change passed.

Then mark the course complete from the Academy course page.

## What to remember

- Ask for small, testable changes.
- Review every diff in the editor.
- Use real compiler and test output in follow-up prompts.
- Keep deployment as a human decision.
- Treat AI as a faster loop, not as a replacement for understanding the contract.
