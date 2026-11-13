# POS production checklist

## Deploy and verify

1. Build and test from a clean checkout with the lockfile. Use a preview deployment connected to staging Firebase before promoting the same commit to production.
2. Configure production Firebase credentials, HTTPS origins, a dedicated session secret, owner PIN, and trusted devices. Check that an anonymous API request receives 401 and that a cashier cannot access owner settings or export backups.
3. Test a walk-in bill, a stock reservation with a simultaneous POS sale, a purchase receipt retry, and website-only delivery approval. Confirm quantities and financial totals in the corresponding reports.
4. Export an owner backup, store it privately, and test restoring it into an empty staging project. Verify the restored record counts before relying on the backup. Keep the previous deployment available for rollback. Code rollback does not undo business transactions.
5. Monitor API 5xx errors, checkout latency, and WhatsApp entries in Sync. Review any receipt reply stuck in processing or marked unknown before attempting another send.

## Automatic WhatsApp bill replies without template charges

Configure `WA_GRAPH_VERSION`, `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`, and a random `WA_WEBHOOK_VERIFY_TOKEN` in the server environment. In Meta, register `https://<pos-host>/api/webhooks/whatsapp` using that verify token and subscribe to the WhatsApp Business Account's messages events. Set the shop WhatsApp number in store settings to the number attached to that Meta phone number ID.

Leave `WA_ALLOW_PAID_TEMPLATES` unset or false for free reply mode. Cashiers open the completed receipt for a sale with a customer mobile number. The customer scans its QR code and sends the prefilled bill request from that same number. The webhook verifies Meta's signature, checks the sender against the invoice, and replies with the PDF as a service message. The log records provider acceptance and deduplicates repeat webhook deliveries.

Before enabling the flow for customers, send a test request from the bill's phone, repeat the same webhook delivery, and try the bill reference from a different phone. Confirm one PDF for the valid request and no receipt for the other phone. Confirm that the template setting remains false and inspect Meta's billing and delivery status. If replies fail, keep using manual PDF sharing while checking the webhook configuration and Sync.

Setting `WA_ALLOW_PAID_TEMPLATES=true` separately enables configured outbound templates for consenting customers. Those messages may incur Meta fees.
