# LAN remote exposure gate (Phase 2D.8 / 2D.9)

**Default:** HTTPS is **loopback-only**. `isRemoteLanPairingEnabled()` is **false** in both the POS backend and the Electron desktop gate until every prerequisite below is met.

**Two-machine pilot:** Not claimed until `docs/LAN_TWO_MACHINE_PILOT.md` is signed off on two Windows machines. Do not flip the code latch beforehand.

## Prerequisites (all required)

1. Code latch `REMOTE_LAN_EXPOSURE_READY === true` (backend `lan-pairing-gate.ts` and Electron `remote-gate.js`) — only after a proven two-machine pilot.
2. Operator env `FARMAX_POS_ALLOW_REMOTE_LAN=1` on the host process (never default, never silent).
3. Valid host TLS material provisioned.
4. Activated host identity (installation + license binding).
5. Pairing protocol ready (OOB pin verification via Electron main `lan:pair-submit` / `pinnedHttpsJson`).
6. Automated tests prove pin mismatch rejects **before** invitation token transmission.

If any prerequisite is missing, listeners remain loopback-only. **Env alone cannot enable remote LAN** while the latch is false.

## Do not enable non-loopback until

1. Production client pin verification works via Electron main.
2. Automated pin-mismatch-before-token tests pass.
3. A successful two-machine test on a real LAN (`LAN_TWO_MACHINE_PILOT.md`).
4. Explicit latch + operator env as above.

## Never

- Silently open firewall ports from application code
- Bind `0.0.0.0` / LAN IPs because invitation generation works
- Disable TLS verification globally
- Bootstrap trust by fetching a fingerprint from the same untrusted HTTPS connection

## How to enable (after pilot latch is true)

1. Confirm `remoteExposureGate.blockingReasons` on host LAN status (only env should remain if latch is already true).
2. Set `FARMAX_POS_ALLOW_REMOTE_LAN=1` in host/desktop env.
3. Restart host backend; verify `remoteLanPairingEnabled: true`.
4. Non-loopback HTTPS bind remains refused by `assertLoopbackHost` / `HOST=127.0.0.1` until a future explicit bind path calls `assertRemotePairingAllowed()`.
5. Any Windows Firewall rule is an **operator** action — not performed by the app.

## How to reverse safely

1. Unset `FARMAX_POS_ALLOW_REMOTE_LAN` (or set to anything other than `1`).
2. Restart host; keep `HOST=127.0.0.1`.
3. Optionally deny remote terminals and/or rotate TLS if the cert was shared beyond intended clients.
4. Close any manually opened firewall rules for the POS HTTPS port.

## Reversible

Remote enablement must remain a clear toggle that can be turned off without regenerating host identity or destroying the local roster.
