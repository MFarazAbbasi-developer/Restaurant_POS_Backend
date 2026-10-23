# LAN host foundation (Phase 2D.3–2D.9)

**Status:** Host licensing client + Plane B POS boundary + loopback HTTPS TLS foundation + **secure pairing protocol** + **host/client pairing UI** (Electron main pin verification) + **authenticated pairing status recovery**. Pairing QR camera UI and remote (non-loopback) exposure are **not** shipped. Staff JWT on local `/api/v1/*` is unchanged. Single-terminal local workflow is preserved.

**Production pin boundary:** Electron main `pinnedHttpsJson` + `lan:pair-submit` IPC. Renderer never sends invitation tokens over unpinned HTTPS. Terminal private keys never reach the renderer or logs.

**Two-machine readiness:** Not claimed until a controlled pilot on two Windows machines has been run (see `docs/LAN_TWO_MACHINE_PILOT.md`). Automated tests cover protocol + recovery; they do not substitute for that pilot.

## TLS certificate lifecycle (Phase 2D.6)

| Item | Behavior |
|------|----------|
| Key type | RSA-2048 self-signed (Node crypto) — **not** Ed25519 licensing key |
| Private key storage | DPAPI CurrentUser under `FARMAX_POS_CONFIG_DIR/host-tls/` |
| Public cert | `host-tls.cer` + fingerprint in `host-tls.meta.json` |
| Rotation | Explicit `rotateCertificate()`; previous fingerprint recorded; open invitations fail closed / re-pair required |
| Fail closed | Missing / corrupt / mismatched / expired / inaccessible key → no HTTPS |
| Silent regenerate | Never auto-repairs corrupt material; never regenerates Ed25519 host identity |

## Listeners

| Listener | Bind | Purpose |
|----------|------|---------|
| HTTP | loopback only (`127.0.0.1`) | Electron / local single-terminal POS |
| HTTPS | loopback only, `HTTPS_PORT` or `PORT+1` | Pairing protocol verification + future LAN clients |

**No remote plaintext HTTP.** Non-loopback HTTPS is refused while `isRemoteLanPairingEnabled() === false`. Code never opens firewall ports.

## Pairing protocol (Phase 2D.7 / 2D.9)

Requires activated host identity + provisioned TLS (`isLanPairingProtocolReady()`).

| Step | Surface | Behavior |
|------|---------|----------|
| Create invitation | `POST /api/v1/lan/pairing/invitations` (staff JWT + `terminals.pair` + manager PIN) | CSPRNG ≥128-bit token; store **hash only**; bind host FP + TLS FP + installation/license; cancel previous OPEN |
| Host screen OOB | Response once | Shows `invitationToken`, HTTPS hint, host + TLS fingerprints — never logged |
| Hello | `POST /api/v1/lan/v1/pairing/hello` | Returns host attestation bound to invitation + TLS pin |
| Complete | `POST /api/v1/lan/v1/pairing/complete` | Validates token + client proof → `AWAITING_APPROVAL` (no cloud yet) |
| Approve | `POST /api/v1/lan/pairing/approve` (manager PIN) | Online cloud `registerTerminal` then local roster ACTIVE; idempotent if already REDEEMED |
| Status / recovery | `POST /api/v1/lan/v1/pairing/status` | Possession proof (`FARMAX-LAN-PAIRING-STATUS-PROOF-V1`) + invitationId + client public key; returns `terminalId` only when REDEEMED and fingerprint matches; **never registers seats**; 48h post-REDEEMED lookup window |
| Cancel | `POST /api/v1/lan/pairing/invitations/cancel` | Manager cancels OPEN / pending |

**Client trust:** `verifyClientTrustBootstrap` — expected TLS/host pins must come from OOB material. Never bootstrap trust from the live HTTPS connection alone.

**Invitation token alone is not host trust.** Status recovery does not require the token (already consumed at complete).

### Status recovery guarantees

- Bound to original invitation session + client public-key fingerprint + signed status proof.
- Wrong key / wrong session / missing proof → no `terminalId`.
- Repeated polls, lost approve responses, and app restart reuse the same pending file + status endpoint; cloud register happens only on manager approve (idempotent for the same key).
- Completed / abandoned sessions expire per invitation TTL; status lookup after REDEEMED is bounded (48h).

## Trust / attestation

Attestation (`FARMAX-HOST-ATTESTATION-V1`) binds `invitationId`, host Ed25519 fingerprint, server time, and **active TLS cert fingerprint**.

## Startup order

1. DB connect  
2. Licensing/LAN runtime bootstrap  
3. Ensure TLS certificate (DPAPI)  
4. HTTP loopback listen  
5. HTTPS loopback listen (if cert valid)  

## Plane B POS boundary

`/api/v1/lan/v1/pos/*` — runtime + Plane B + entitlement + existing auth/RBAC.  
`/api/v1/lan/v1/pairing/hello|complete|status` — protocol ready when host activated + TLS.  
Remote non-loopback binding — still disabled by default.

## Remote exposure (explicit operator gate)

**Default: disabled.** `REMOTE_LAN_EXPOSURE_READY` in code stays `false` until a two-machine pilot is completed and deliberately latched.

Enabling non-loopback requires **all** of:

1. Code latch `REMOTE_LAN_EXPOSURE_READY === true` (after pilot — not flipped for convenience)
2. Operator env `FARMAX_POS_ALLOW_REMOTE_LAN=1` on the host process
3. Valid TLS material provisioned
4. Activated host identity (installation + license binding)
5. Pairing protocol ready (trust flow usable on loopback)

If any prerequisite is missing, listeners remain loopback-only. **Env alone cannot open remote LAN** while the latch is false.

### How an operator enables (after pilot latch is true)

1. Confirm TLS meta + host activation on **LAN Terminals** overview (`remoteExposureGate.blockingReasons` empty except latch/env as expected).
2. Set `FARMAX_POS_ALLOW_REMOTE_LAN=1` in desktop/host env (e.g. `FARMAX_POS_CONFIG_FILE` / process env injected by Electron).
3. Restart the host backend. Verify status shows `remoteLanPairingEnabled: true` only when latch + env + TLS/host are all satisfied.
4. Bind HTTPS to the intended LAN address **only** via a future explicit bind path that still calls `assertRemotePairingAllowed()` — today the server still refuses non-loopback `HOST`.
5. Do **not** open firewall ports from the app. If Windows Firewall must allow inbound HTTPS, the operator does that manually and documents the port.

### How to reverse safely

1. Unset `FARMAX_POS_ALLOW_REMOTE_LAN` (or set to anything other than `1`).
2. Restart host backend — `isRemoteLanPairingEnabled()` returns false; keep `HOST=127.0.0.1`.
3. Optionally revoke/deny remote terminals on the roster and rotate TLS if the cert was shared beyond the intended clients.
4. Close any manually opened firewall rules for the POS HTTPS port.

## Remaining blocker for remote LAN

1. Two-machine pilot completed and documented (`LAN_TWO_MACHINE_PILOT.md`).
2. Flip `REMOTE_LAN_EXPOSURE_READY` only after that pilot.
3. Explicit non-loopback HTTPS bind path + operator firewall (never silent).
