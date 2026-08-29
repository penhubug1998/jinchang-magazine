# V3.1-alpha19 Changelog

- Reader control bar: real fullscreen + full Workspace popout; manual resync demoted.
- Workspace popout: draft handoff via `handoff=1`.
- Reader navigation: request/ack target-page synchronization, stale-page guard, Reader-driven reverse sync.
- Reload policy: only after an observed page mismatch; silent/non-acking preview does not force iframe recreation.
- Secondary dialogs: larger descriptive/help typography, with extra planner/production-board overrides.
- Regression coverage: Alpha11 iframe stability, Alpha18 fallback sync and Alpha19 request/ack are required to pass together.
