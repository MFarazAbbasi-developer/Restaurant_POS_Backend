# Controlled two-machine LAN pairing pilot (Phase 2D.9)

**Status: NOT RUN on two machines in this workspace session.** Automated protocol + recovery tests are required before attempting this checklist. Do **not** mark the pilot successful, flip `REMOTE_LAN_EXPOSURE_READY`, or claim LAN readiness until every step below has been executed on two separate Windows PCs.

Remote exposure stays **disabled** during this pilot. Use loopback HTTPS on the host machine and a second machine only when an explicit, temporary, operator-documented path exists — for a first pass, both “machines” may mean host + client Electron profiles on one PC only if a second PC is unavailable; that is **not** a successful two-machine pilot.

## Prerequisites

- Disposable / lab restaurant only (never production customer DB).
- Host: activated licensing binding, TLS provisioned, pairing protocol ready.
- Client: FARMAX POS desktop app (Electron) — browser-only join is not valid.
- Manager account with `terminals.pair` (+ `terminals.revoke` for deny step).
- Licensing cloud reachable for approve (or lab mock equivalent documented separately).

## Checklist

| # | Step | Pass criteria | Result |
|---|------|---------------|--------|
| 1 | Host generates invitation and displays OOB trust JSON (token, HTTPS hint, host FP, TLS FP) | Token shown once; never logged | ☐ |
| 2 | Client pastes invitation with **intentionally wrong** TLS pin | Rejected **before** invitation token is sent (`LAN_TLS_PIN_MISMATCH`) | ☐ |
| 3 | Client pastes correct pin; manager approves | Client reaches `AWAITING_APPROVAL` then status `REDEEMED` with terminal ID | ☐ |
| 4 | Restart **both** host and client apps; client recovers / reconnects | Same terminal ID; pending cleared; no re-submit of token required | ☐ |
| 5 | Seat accounting | Exactly **one** additional terminal seat consumed for that client key | ☐ |
| 6 | Host denies the terminal | Plane B / protected POS routes reject the denied terminal | ☐ |
| 7a | Cloud outage during approve | No local ACTIVE until cloud register succeeds | ☐ |
| 7b | Lost approve / status responses | Client poll recovers terminal ID; no second register | ☐ |
| 7c | Expired invitation | Client complete/status fail closed | ☐ |
| 7d | Certificate rotation | Open invitations fail; re-pair required with new OOB pin | ☐ |
| 8 | Host-local POS | Single-terminal local HTTP POS continues throughout | ☐ |

## Sign-off

- Operator: __________________ Date: __________
- Second machine available: Yes / **No**
- Pilot successful: **No** until all rows are Pass on two machines

If a second machine is unavailable: finish automated validation, leave this document unsigned for success, and keep `REMOTE_LAN_EXPOSURE_READY = false`.
