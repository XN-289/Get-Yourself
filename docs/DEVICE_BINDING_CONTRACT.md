# Device Binding Contract v0.1

## Goal

Device binding lets one student account authorize a local Get Yourself workbench without copying the web login session to disk. It creates only a device-level authorization relationship.

This contract does **not** transfer product data. Capability evidence import remains the explicit Stage 2 file flow. Resume full text, reports, STAR stories, scanned documents, application details, and job summaries are not imported or uploaded by binding.

## Binding Flow

1. The student opens the Agent workbench and requests a code.
2. The backend revokes that account's previous pending code and returns a code in the format `GY-XXXX-XXXX`.
3. The web shows the command and expiry time. The plaintext code is not persisted in frontend state beyond the current pending flow and is never written to Agent Trace.
4. The student runs the CLI command:

   ```powershell
   node cli/gy.mjs connect GY-XXXX-XXXX --device-name "我的本机工位"
   ```

5. The CLI sends the code, installation ID, and device name to the public bind endpoint.
6. The server locks and consumes the pending row, revokes a prior active binding with the same installation ID if present, and returns a 32-byte Base64URL device token exactly once.
7. The CLI atomically writes the installation ID and binding credential to its user layer.
8. The web polls the device list every 3 seconds while a pending or active device is visible. It shows the device as active after binding and returns to the unbound state after the CLI disconnects it.

The code expires after 10 minutes. Generating a new code revokes the previous pending code. A code can activate only one device row and cannot be reused.

## API Contract

All authenticated web endpoints use the existing student bearer session.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/workbench/devices` | Web session | List pending and active devices |
| `POST` | `/api/workbench/devices/code` | Web session | Create a one-time pending code |
| `POST` | `/api/workbench/devices/bind` | Binding code | Exchange a pending code for a device token |
| `POST` | `/api/workbench/devices/status` | Device token | Check authorization and refresh last-active time |
| `POST` | `/api/workbench/devices/disconnect` | Device token | Revoke the current device from the CLI |
| `DELETE` | `/api/workbench/devices/{deviceId}` | Web session | Revoke a device from the web device manager |

The bind request contains `deviceCode`, `deviceName`, and `installId`. The device token is sent only in the `X-Device-Token` header by explicit CLI operations. It is not a bearer session token and does not grant web account access.

## Server State

`workbench_devices` stores:

- Account ID.
- Device display name.
- SHA-256 installation ID hash.
- SHA-256 binding code hash while pending.
- SHA-256 device token hash while active.
- `pending`, `active`, `revoked`, or `expired` state.
- Expiry, bound, last-active, and revoked timestamps.

Constraints:

- Plaintext codes, installation IDs, and device tokens are never persisted server-side.
- Code and token hash columns are unique where non-null.
- An account may have at most 5 active devices.
- Rebinding the same installation ID revokes its previous active token.
- Revocation clears the code and token hashes.
- Bind uses a row-level pessimistic lock so concurrent attempts cannot both consume the same pending code.

## CLI Commands

```powershell
node cli/gy.mjs connect GY-XXXX-XXXX [--server URL] [--device-name NAME] [--replace] [--json]
node cli/gy.mjs disconnect [--json]
node cli/gy.mjs --status [--json]
```

Defaults and overrides:

- Default API URL: `http://localhost:8080`.
- Environment override: `GET_YOURSELF_API_URL`.
- `--server` overrides the environment for one connect operation.
- `--replace` is required when a local binding already exists.

Local user-layer files:

- `cli/data/device-installation.json`: stable random installation ID.
- `cli/data/device-binding.json`: device ID, display name, server URL, bound time, and device token.

Both files are gitignored. Writes are atomic and use restrictive file permissions where the platform supports them. CLI-visible result objects and `--status` output exclude the device token.

## Unbind And Failure Boundary

- Web-side unbind revokes cloud authorization and preserves every local file.
- CLI disconnect calls the server first and removes only `device-binding.json` after success. The installation ID and all other user data remain.
- `connect --replace` first attempts to disconnect the old credential. A 400, 401, or 404 response is treated as an already-invalid old credential; network and server failures stop the replacement.
- An invalid or missing local credential does not alter the installation ID or evidence package.

## Security Boundaries

- The device token is returned once and stored only in the CLI user layer.
- Agent Trace records the binding action and boundary, not the code or token.
- The web login bearer token is never written by the CLI.
- Binding grants no automatic data import or outbound sync authority.

Current v0.1 is the local integration loop. Before exposing the bind endpoint on an untrusted public network, add IP- or account-level rate limiting and serve the API over HTTPS. These are deployment prerequisites, not implicit guarantees of the current local demo.
