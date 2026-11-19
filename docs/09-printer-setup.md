# Barcode, bill and delivery-sticker printing

The shop defaults are True-Ally 50 × 38 mm adhesive labels for product barcodes and SEZNIK Shakti 4 × 6 inch labels for POS bills and website delivery stickers. Four by six inches is 101.6 × 152.4 mm; the separate 100 × 150 mm option is for that stock size.

## Set up the printer once

1. Install the manufacturer's Windows/macOS driver and connect the SEZNIK Shakti by USB. Driver downloads: https://seznik.in/pages/drivers. The printer must appear in the operating system's printers list.
2. Load the paper that matches the task. Use gap/label mode for the adhesive rolls and calibrate the printer according to its manual.
3. Open the POS print preview and check the selected label or paper size. The first selection uses the shop default; subsequent selections are remembered on that browser or workstation. **Use shop default** restores the original choice.
4. In the system print dialog, select the installed printer, choose matching media, use 100% / actual size, and disable browser headers and footers. Labels use zero page margins; bills have their own small content margins.
5. Print one test label and scan the barcode before a batch. Printer feed, calibration, density and real-world scanner performance require a physical test with the shop hardware.

Bluetooth mobile printing depends on the manufacturer's app and operating-system support. The web POS uses the system print dialog; it does not pair Bluetooth devices or send raw printer commands. To use the manufacturer's mobile app, save the selected layout as a PDF from the print dialog and open it in the supported app. Manufacturer product information: https://seznik.in/products/shakti-shipping-label-printer-4-6-label-adjustable-label-size-print-bluetooth-usb-connect-inkless-thermal-print-from-mobile-laptop-does-not-support-seller-flex-1year-warranty.

## Print product barcodes

Choose **Print Barcodes** on a product, or **Print multiple product barcodes** to select variants across products. Set copies for each variant, select the label stock, and print. Thermal layouts print exactly one label per page. A4 layouts retain their 18-, 24- or 40-label grids and continue onto additional sheets.

Available sizes: 50 × 38 mm (default), 50 × 25 mm, 38 × 25 mm, 38 × 60 mm, 100 × 150 mm, 4 × 6 inches, and the three A4 sheet layouts. The single-product and batch screens share the saved media preference. Barcode images finish loading before the print dialog opens; a failed image stops printing with a retry message.

## Print POS bills

Open the bill preview after a sale or use **Orders → Receipt / reprint**. The default is 4 × 6 inches. Other options are 100 × 150 mm, 80 mm and 58 mm receipt rolls, A5 and A4. Long bills continue on additional pages without truncating items or totals.

**Download A4 PDF** downloads the existing shareable receipt document. To save the currently selected printer layout, choose **Save as PDF** in the system print dialog.

## Print website courier labels

Open **Orders → Courier label / print** for a website order, then choose **Download courier label**. The POS uses the order's saved AWB to retrieve the original Delhivery PDF from the Package Slip API. Open the downloaded PDF to preview and print; choose the SEZNIK Shakti, 4 × 6 inch stock, actual size, and the required copy count in the PDF viewer's print dialog. Configure Delhivery One's shipping-label format as A6 / 4 × 6 inches for this printer. The provider's original PDF is preserved.

If the order has no AWB yet, create/manifest the shipment through the website's existing delivery option first. This POS action only retrieves the label; it does not create shipments, change delivery addresses or book pickups. Failed API requests show an error and never substitute a locally generated sticker.

The POS server uses the same **DELHIVERY_API_KEY** environment-variable name as the website. Local development reads the configured website environment file; hosted POS servers must have that server-side variable configured explicitly. **DELHIVERY_ENV** defaults to **production**; use **staging** only with a staging token. The key is never sent to the browser or to the signed PDF download host.

Delhivery documentation: https://one.delhivery.com/developer-portal/document/b2c/detail/faq. Shipping-label format settings: https://help.delhivery.com/docs/shipping-label-configuration.

## Verification

Automated tests cover label pagination, delivery API request parameters, saved-AWB lookup, original-PDF delivery, missing shipments, provider failures and private credential handling. Browser checks exercise the courier PDF download and missing-AWB state with fixtures. Barcode and receipt media layouts retain the previous browser/PDF verification. No live shipments are created or changed by verification.
