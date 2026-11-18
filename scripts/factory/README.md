# Factory tooling (persistent copy)

These are the canonical build scripts. The same files are also committed inside
ambush-previews/scripts/ so a container wipe cannot delete them.

Paths are resolved from AMBUSH_FACTORY_DIR (default /home/node/.openclaw/workspace/factory).
Nothing here writes to /tmp except disposable logs.

HARD RULES
- NO VERIFIED PUBLIC EMAIL + EVIDENCE URL = NO BUILD (preBuildGuard, fail-closed)
- Never source leads from raw Companies House dumps: it publishes no contact emails
- Outbound HOLD: NEW EXTERNAL SENT = 0, DRAFTS = 0
