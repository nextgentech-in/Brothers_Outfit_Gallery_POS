# Daily-use update — 4 November 2026

This source package includes the latest local changes, including changes not committed to GitHub. It does not enable live writes or publish a deployment.

## Purchase entry and labels

Open **More tools → Suppliers → Purchase order / stock receipt**. Choose a supplier and invoice reference. Add existing variants or choose **Add new item**. Enter quantity, unit cost, sale price and MRP; the form calculates cost × quantity and the supplier balance. New items also accept brand, design/article, fabric, size and colour.

**Received — add stock now is the default.** Saving creates the item and receives its stock in one database transaction. It also records the initial supplier payment using the selected method. A retry with the same reference cannot receive stock twice; a second receipt for the same supplier invoice is rejected. Existing stock uses a weighted average cost. New catalog products remain website drafts until published separately.

The optional **Purchase order — awaiting goods** mode defers stock changes until **Mark received**. CSV import supports up to 30 validated rows per purchase, with editable review before saving; use the supplied template. Existing variants can be identified with `productId` and `sku`.

Products → **Print multiple product barcodes** creates Code 128 labels with brand, design, size, item, fabric, colour, MRP and sale price. Purchase cost is never printed. Choose copies per variant and A4 columns. Test a printed sample with your scanner and printer before a large run.

## Daily shop flows

- Billing automatically saves the active draft on this browser. Hold and resume still work. Saved drafts and held bills do not reserve stock.
- Quick bills keep customer information optional. A mobile number requires a birthday; udhar requires customer name, mobile, birthday and repayment date.
- Cash received/change and cash/UPI/card/udhar split payments are supported. Only the unpaid portion goes into udhar. Payment allocations must equal the bill total.
- A changed catalog total is rejected for review instead of silently charging a different amount.
- Orders searches historical invoices, customer names/mobile numbers and dates, with reprinting. Select return quantities and whether items are sellable. Paid bills can exchange items with a price difference; udhar bills use a return followed by a separate replacement bill.
- Refunds are recorded **after paying the customer**. Recording a refund does not transfer funds. Repeated requests cannot duplicate refunds or exceed the amount owed.
- Reports uses India business dates and separates sales, credit repayments and paid refunds. Expenses, withdrawals and supplier cash payments affect expected cash. Cash closing saves the opening/count/variance snapshot; later activity is displayed separately.
- Saved customer details autofill billing. Customers can edit name, email, birthday and offer consent; phone remains the account identity. The Bills action opens bill history for that mobile.
- Manual WhatsApp drafts work without API credentials. English, Hindi and Gujarati drafts support saved shop notes. Credit reminders fill the saved balance/date. Staff must review and tap Send in WhatsApp.
- Receipt printing supports A4, 80 mm and 58 mm widths. Long PDF receipts continue across pages.
- Physical stock counts record movement history and detect concurrent changes. Counts cannot go below reservations. Reorder thresholds are configurable per variant and affect dashboard warnings.
- Supplier balances support later partial payments, allocated to oldest outstanding receipts.
- New product entry generates a SKU and supports size × colour combinations. Website descriptions, offers and size guides are optional expandable sections.

## Offline and uncertain outcomes

After successful online use, the installed production shell can reopen its saved billing workspace offline for up to eight hours. This prepares **provisional** bills only; it does not prove that server authentication, stock or credit balances remain valid. The current browser retains drafts, catalog, held bills and queued commands. Reconnecting requires a valid server session and rechecks stock/prices.

Sync shows pending bills and can export their JSON. **Check result / restore for editing** first checks the original command on the server. If already posted, it reports the invoice. Otherwise it atomically locks that old command against future posting before moving it into held bills for editing. Recovering requires a connection. Keep the exported JSON private because it can contain customer details.

Purchase, repayment, return, expense and supplier-payment retries retain their command references on this device. Retry the saved operation after an ambiguous failure; do not enter a second payment elsewhere before checking the first result. Clearing browser storage deletes local recovery data.

## Staff and backups

Owner controls are under **More tools → Trusted devices**. Create individual cashier or manager PINs. Cashiers can bill without discounts and collect existing credit payments; stock changes, returns, supplier operations and business reports require manager/owner access. Staff administration, trusted-device management and backups require the owner. Revoked staff fail subsequent session checks. Staff PINs are stored as salted scrypt hashes; use a stable session secret for staff operations.

**Download business backup** exports a consistent read-only snapshot of the allowlisted POS business collections. It excludes authentication/device records, staff credentials, website users/settings, Firebase Auth accounts and external image files. This is a POS business backup, not a complete website/disaster-recovery export.

On a persistent Node host, set `POS_BACKUP_DIR` to a private durable directory to write daily copies and retain seven days. Copy these to separate storage. The timer does not run in Vercel Functions; configure an external backup schedule for that hosting model. No schedule was enabled here.

Restore only into an isolated empty Firebase project:

```sh
npm run backup:restore -- /private/backup.json EXACT_TARGET_PROJECT_ID
```

The script validates the file and target project and refuses a nonempty target. It writes batches; a failed partial restore must be inspected and restarted into another empty target. It never rolls back accepted live transactions. Validate balances, invoices and stock before switching any app to restored data.

## Validation and remaining limits

Regression tests exercise financial and stock rules with an in-memory Firestore adapter that enforces reads before writes. Browser checks use fixtures and do not mutate production business data or send messages. All 48 automated tests passed. Type checking, the production build and whitespace checks passed. Desktop/mobile fixture browser checks passed for purchase creation, automatic values, clothing barcode output, draft reload, cash change, receipt printing and the existing WhatsApp/Quick Bill flows.

Live Firestore concurrency/index behavior, physical printers/scanners, installed offline reopening on shop devices and a full restore drill still require testing in the configured shop environment. Financial reports do not calculate historical profit/COGS or GST. GST invoicing remains deferred.

The prior review also suggested larger follow-ups: purchase returns/supplier due-date statements, a unified customer history, automatic reorder suggestions, and scalable database pagination/materialized credit summaries. These are **not fully implemented** in this package. Bill search still reads the selected date range before paging results; the credit directory groups ledger entries efficiently and displays 50 customers at a time, but still reads the full ledger. Dashboard is a recent 200-order overview; use date-based Reports for complete period totals.
