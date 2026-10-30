# Trusted-device access proposal (review before implementation)

The shop PIN is `0000` and is already known. The production POS must not expose orders, customer records, receipts, stock controls, or billing to anyone on the internet who enters that PIN. The owner needs to use the POS from anywhere on their own devices, with only a PIN in the ordinary sign-in screen.

## Proposed flow

1. On the local shop preview at `http://localhost:4310`, the owner signs in with the existing PIN and selects **Trust a device**.
2. The local server writes a single-use invitation valid for 10 minutes and displays a link to the production POS. The random invitation token is placed in the URL fragment so it is not sent in HTTP requests or server access logs.
3. The owner opens that link on a device they control. The production server consumes the invitation in one Firestore transaction, issues a random device token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie, and stores only its SHA-256 digest. The device grant expires after 90 days.
4. Future production sign-ins on that device ask only for the four-digit PIN. The server checks the device grant and the PIN. New, expired, or revoked devices cannot sign in with the public PIN alone.
5. The local preview lists trusted devices with creation and last-used dates and can revoke any device. Revoking a device also invalidates its active POS sessions.

The website's own customer sign-in and checkout are unaffected. Product, variant, stock, order, customer, and image collections are not copied or changed by this feature.

## Additive Firestore mapping

The existing proposal already includes a new `erp_authState` collection for hosted POS sessions and PIN attempt limits. This feature would add only these document types within that collection; it does not drop, rename, or retype any existing field:

| Document ID | Fields | Purpose |
| --- | --- | --- |
| `device_invite_<sha256(token)>` | `kind`, `createdAt`, `expiresAt`, `consumedAt`, `createdBy` | Single-use, 10-minute pairing invitation. No raw token is stored. |
| `device_grant_<sha256(token)>` | `kind`, `createdAt`, `expiresAt`, `lastUsedAt`, `revokedAt`, `label` | Browser-bound device grant. No raw token or PIN is stored. |
| `session_<hmac(token)>` | Add nullable `deviceGrantId` | Allows device revocation to invalidate active sessions. Existing session fields remain unchanged. |

All times are UTC epoch milliseconds. `label` is a short owner-entered device name without personal information. The Firestore access rules remain server-only for `erp_authState`.

## Rollback

1. Set `ADMIN_DEVICE_ACCESS=disabled` in the production environment and redeploy. Enrollment, hosted PIN sign-in and active sessions fail closed while rollback proceeds.
2. Run a dry-run script to enumerate only `device_invite_` and `device_grant_` documents in `erp_authState` and sessions whose `deviceGrantId` references those grants.
3. With `--apply --project=<exact-project-id>`, delete those device documents and associated sessions in batches. Existing unrelated `erp_authState` PIN-limit and legacy session documents are retained unless the separate auth rollback is requested.
4. Remove the device-cookie setting from production. Browser cookies expire automatically or are cleared at the next response.

Rollback does not touch website collections, product stock, invoices, orders, customers, or audit history. The script will default to dry run and refuse a project ID mismatch.

## Production requirements

- The Vercel project must have `ADMIN_PIN`, `ADMIN_SESSION_SECRET`, and the same Firebase server credentials as the website, all stored server-side.
- Set `ADMIN_DEVICE_ACCESS=disabled` before any emergency rollback; remove it only after the intended trusted-device configuration has been restored.
- The server permits hosted PIN sign-in only for a valid, non-revoked trusted-device cookie. No manual host-protection flag can bypass this check.
- `ADMIN_BUSINESS_WRITES` remains disabled until the separate shared-stock/schema cutover is reviewed.
- A device can be trusted only from a short-lived invitation created from the local shop preview. There is no public self-registration path.

**Status:** approved and implemented in code. No device document has been written from this project yet. Pairing on Vercel still requires the server-only Firebase and session credentials to be configured in that project.
