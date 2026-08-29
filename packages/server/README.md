# @antorfr/demeura-server

The Fastify application: identity, extension discovery, and the **single spawn
site** every agent turn goes through.

That last one is a rule, not an implementation detail. Chat, scheduled turns
and delegated work all call the same `runTurn`, so the driver's env contract,
the concurrency cap and the transcript apply once. The predecessor had two
spawn paths; forgetting one broke an entire channel silently for days.

Configuration is one declarative file — see `demeura.config.example.yaml` at the
repository root. Env vars override only what is deployment-specific or secret.
