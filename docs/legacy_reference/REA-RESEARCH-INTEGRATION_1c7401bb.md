# NexusAI v6.0 — REA research integration

## Source reviewed
The supplied archive is REA (Reverse Engineer Anything), version 6.9.0 in its package metadata:
https://github.com/morluto/rea

REA is an MCP/CLI reverse-engineering toolkit for inspecting shipped applications, JavaScript/Electron bundles, native binaries and runtime behavior. It is not a ChatGPT model, model-weight archive, training dataset, or drop-in reasoning engine.

## Adopted in NexusAI
- staged investigations with explicit questions and required evidence;
- summary-first inspection and focused follow-ups;
- separation of observations, inferences and unknowns;
- source/result traceability and explicit coverage limits;
- untrusted-data handling for repository, web and uploaded content;
- avoiding unchanged repeated tool calls;
- completion review against the original checklist;
- regression tests and measured claims rather than unsupported percentages.

This protocol is injected into the single-agent planner, multi-role coordinator/specialists and independent reviewer.

## Not integrated
The archive contains a separate reverse-engineering product with native-analysis bridges, provider adapters and MCP tools. Those engines and dependencies are not bundled into NexusAI. Copying thousands of files would add complexity without making the language model smarter. NexusAI does not claim REA's native binary-analysis capabilities.

## Next engineering step
A real NexusAI artifact-analysis subsystem would need safe archive inventory, JavaScript bundle inspection and Android APK metadata inspection, with file/resource limits, evidence records and tests. Native decompilers/debuggers require separate installed providers and platform-specific integration.

## Attribution
The supplied REA project identifies itself as MIT-licensed. NexusAI uses original prompt guidance derived from documented workflow ideas; no REA implementation source was copied.
