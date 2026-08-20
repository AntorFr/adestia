# @antorfr/golem-drivers

The driver contract and its adapters. A driver wraps one coding-agent CLI and
declares what it can honour (`authManagement`, `usageMetrics`, `modelSelection`,
`mcpStatus`, …). The UI is generated from the capability descriptor — no driver
name ever reaches the front end.

Conformance requires a **fake-binary test suite** replaying the CLI's observed
behaviour: no driver is trusted on prose. The Copilot spike proved this is
cheap — a local BYOK mock provider exercises the whole JSONL path with zero
GitHub credentials (`spikes/copilot-cli/`).
