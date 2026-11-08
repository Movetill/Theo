# Contributing to Theo

Use Node 22 or newer. From the repository root, run:

```sh
npm ci --ignore-scripts
npm test
```

Core changes belong in `packages/core`. Persistence belongs in `packages/workspace`, and DSH argument parsing and tool presentation live in `src/dsh`. Keep behavior shared between the Core and the DSH adapter. Update the IR specification or tool contract when you change their public behavior.

For logic changes, compare outputs with an independent reference and cover the relevant width, reset, or error boundary. Keep the existing 12 tool contracts compatible. For adapter changes, run the workflow in the pinned DSH version and record the actual tool calls and results. See [architecture](docs/ARCHITECTURE.md), [compatibility](docs/COMPATIBILITY.md) and [DSH integration](docs/DSH_INTEGRATION.md).

Keep local designs, credentials, private sessions and raw host logs out of contributions. When reporting an issue, include a minimal synthetic design, input frames, actual result and expected result.

Before sharing a candidate, inspect `npm pack --dry-run --json` for the plugin entry, bundle patch, compiled runtime, Skill, examples and MIT license. Confirm that all code and assets you contribute can be distributed under the project license.
