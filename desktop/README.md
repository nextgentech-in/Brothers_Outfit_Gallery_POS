# Brothers Outfit POS for Windows

The desktop app packages the existing POS interface and uses the same hosted API as the browser POS. The shared website catalog, website order routing, and POS records stay connected through that API.

## Build and install

From the POS repository, run `npm ci`, `npm --prefix desktop ci`, and `npm --prefix desktop run package:win` on Windows. The installer goes in `artifacts/desktop`. The local build is unsigned and requires manual upgrades. Keep the same application identity for future installers so the Windows profile and local data stay in place.

On the shop PC, open **POS → Open device invitation**, paste a fresh owner-generated pairing link, and sign in online. Open Billing while connected to cache the catalog. The installer does not need Firebase credentials or API keys.

## Working offline

Windows keeps the local catalog, held bills, and pending sales in the app profile's IndexedDB database. Offline access depends on a recent verified session under the same Windows user and is capped by the server session expiry or eight hours, whichever is sooner. An expired session requires connectivity. Cache and bill details are stored under the Windows user profile, so use a dedicated shop account with disk encryption and screen locking.

Save a bill while disconnected and use **Save & Share** to open its printable provisional receipt. The server assigns the final invoice number after sync. The app retries using the original transaction reference and moves stock or price conflicts to **Sync health** for review. Keep the app open and signed in after the connection returns. To limit overselling while both channels are running, use one offline till at first and set aside stock for website orders.

Purchase orders, stock receipts, returns, reports, online payment confirmation and WhatsApp delivery use the live server. Offline billing uses the last cached catalog and cannot see new website sales until connectivity returns.

Before shop rollout, test a paired staging device with an offline sale, a restart, a printed receipt, and reconnect. Verify one final invoice and one stock deduction. Verify that pending bills survive an installer upgrade and are visible in Sync health.
