import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { formatBarcode, SEQUENCE_COLLECTION, SEQUENCE_DOC_ID } from '../server/productNumbering.js';
import { firebase } from '../server/firebase.js';

interface MigrationReport {
  mode: 'DRY_RUN' | 'APPLIED';
  totalProducts: number;
  alreadyNumbered: number;
  newlyAssignedCount: number;
  newlyAssignedRange: string;
  counterUpdatedTo: number;
  samples: Array<{
    id: string;
    name: string;
    productNumber: number;
    barcode: string;
    variants: Array<{ sku: string; variantSequence: number; barcode: string }>;
  }>;
}

function getMillis(val: unknown): number {
  if (!val) return 0;
  if (val instanceof Timestamp) return val.toMillis();
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val > 1e11 ? val : val * 1000;
  if (typeof val === 'string') {
    const t = new Date(val).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof val === 'object' && val !== null) {
    if ('_seconds' in val) return Number((val as any)._seconds) * 1000;
    if ('seconds' in val) return Number((val as any).seconds) * 1000;
  }
  return 0;
}

export async function planOrApplyMigration(db: any, apply = false): Promise<MigrationReport> {
  const productsSnap = await db.collection('products').get();
  const docs = productsSnap.docs.map((d: any) => ({ id: d.id, ref: d.ref, data: d.data() }));

  // Stable documented order: creation date ascending, followed by document ID ascending
  docs.sort((a: any, b: any) => {
    const timeA = getMillis(a.data.createdAt);
    const timeB = getMillis(b.data.createdAt);
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  let maxAssigned = 0;
  let alreadyNumbered = 0;

  // First pass: identify existing product numbers
  for (const doc of docs) {
    const num = doc.data.productNumber;
    if (typeof num === 'number' && Number.isInteger(num) && num > 0) {
      alreadyNumbered++;
      if (num > maxAssigned) {
        maxAssigned = num;
      }
    }
  }

  // Check current sequence counter in database
  const seqDoc = await db.collection(SEQUENCE_COLLECTION).doc(SEQUENCE_DOC_ID).get();
  if (seqDoc.exists) {
    const currentCounter = Number(seqDoc.data()?.lastNumber || 0);
    if (currentCounter > maxAssigned) {
      maxAssigned = currentCounter;
    }
  }

  const updates: Array<{
    ref: any;
    data: any;
    summary: MigrationReport['samples'][number];
  }> = [];

  let nextNumber = maxAssigned;
  const startNumber = nextNumber + 1;

  for (const doc of docs) {
    const data = doc.data;
    const existingNum = data.productNumber;

    if (typeof existingNum === 'number' && Number.isInteger(existingNum) && existingNum > 0) {
      // Product already has a valid permanent number.
      // Ensure it has standard BOG barcode if missing
      const rootBarcode = data.barcode && data.barcode.startsWith('BOG-')
        ? data.barcode
        : formatBarcode(existingNum, 1);

      const variants = Array.isArray(data.variants) ? data.variants : [];
      let variantsModified = false;
      const updatedVariants = variants.map((v: any, index: number) => {
        const seq = v.variantSequence || index + 1;
        const vBarcode = v.barcode && v.barcode.startsWith('BOG-') ? v.barcode : formatBarcode(existingNum, seq);
        if (v.variantSequence !== seq || v.barcode !== vBarcode) {
          variantsModified = true;
        }
        return {
          ...v,
          variantSequence: seq,
          barcode: vBarcode
        };
      });

      if (data.barcode !== rootBarcode || variantsModified) {
        updates.push({
          ref: doc.ref,
          data: {
            barcode: rootBarcode,
            nextVariantSequence: Math.max(variants.length + 1, Number(data.nextVariantSequence || 1)),
            variants: updatedVariants,
            updatedAt: FieldValue.serverTimestamp()
          },
          summary: {
            id: doc.id,
            name: data.name || 'Unnamed',
            productNumber: existingNum,
            barcode: rootBarcode,
            variants: updatedVariants.map((v: any) => ({ sku: v.sku, variantSequence: v.variantSequence, barcode: v.barcode }))
          }
        });
      }
      continue;
    }

    // Product lacks productNumber: assign sequential permanent number
    nextNumber++;
    const pNumber = nextNumber;
    const rootBarcode = formatBarcode(pNumber, 1);
    const variants = Array.isArray(data.variants) ? data.variants : [];
    const updatedVariants = variants.map((v: any, index: number) => {
      const seq = index + 1;
      const vBarcode = formatBarcode(pNumber, seq);
      return {
        ...v,
        variantSequence: seq,
        barcode: vBarcode
      };
    });

    updates.push({
      ref: doc.ref,
      data: {
        productNumber: pNumber,
        nextVariantSequence: variants.length + 1,
        barcode: rootBarcode,
        variants: updatedVariants,
        updatedAt: FieldValue.serverTimestamp()
      },
      summary: {
        id: doc.id,
        name: data.name || 'Unnamed',
        productNumber: pNumber,
        barcode: rootBarcode,
        variants: updatedVariants.map((v: any) => ({ sku: v.sku, variantSequence: v.variantSequence, barcode: v.barcode }))
      }
    });
  }

  const finalCounter = nextNumber;
  const newlyAssignedCount = nextNumber - maxAssigned;
  const newlyAssignedRange = newlyAssignedCount > 0 ? `${startNumber} to ${finalCounter}` : 'None';

  if (apply) {
    // Write in chunks of 400
    const chunkSize = 400;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      const batch = db.batch();
      for (const item of chunk) {
        batch.update(item.ref, item.data);
      }
      await batch.commit();
    }

    // Update sequence counter
    await db.collection(SEQUENCE_COLLECTION).doc(SEQUENCE_DOC_ID).set({
      lastNumber: finalCounter,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  return {
    mode: apply ? 'APPLIED' : 'DRY_RUN',
    totalProducts: docs.length,
    alreadyNumbered,
    newlyAssignedCount,
    newlyAssignedRange,
    counterUpdatedTo: finalCounter,
    samples: updates.slice(0, 5).map(u => u.summary)
  };
}

async function runCli() {
  const isApply = process.argv.includes('--apply') || process.argv.includes('--execute');
  let db;
  try {
    db = firebase().db;
  } catch (err: any) {
    console.error(`\n❌ Could not connect to Firebase: ${err.message}`);
    console.error(`Please ensure your environment or .env file is configured with FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_ADMIN_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY).\n`);
    process.exit(1);
  }
  console.log(`\n======================================================`);
  console.log(`  BROTHERS OUTFIT GALLERY — PRODUCT NUMBER MIGRATION  `);
  console.log(`  Mode: ${isApply ? '🚀 APPLY LIVE CHANGES' : '🔍 DRY RUN (Simulation only)'}`);
  console.log(`======================================================\n`);

  const report = await planOrApplyMigration(db, isApply);

  console.log(`Summary Report:`);
  console.log(`------------------------------------------------------`);
  console.log(`Total products found   : ${report.totalProducts}`);
  console.log(`Already numbered       : ${report.alreadyNumbered}`);
  console.log(`Newly assigned numbers : ${report.newlyAssignedRange} (${report.newlyAssignedCount} products)`);
  console.log(`Sequence counter ${isApply ? 'updated to' : 'would be set to'} : ${report.counterUpdatedTo}`);
  console.log(`------------------------------------------------------\n`);

  if (report.samples.length > 0) {
    console.log(`Sample Preview (First ${report.samples.length} items):`);
    report.samples.forEach((s, idx) => {
      console.log(`  [${idx + 1}] #${s.productNumber} - "${s.name}" (ID: ${s.id})`);
      console.log(`      Root Barcode: ${s.barcode}`);
      if (s.variants.length > 0) {
        console.log(`      Variants: ${s.variants.map(v => `${v.sku} -> ${v.barcode}`).join(', ')}`);
      }
    });
    console.log(``);
  }

  if (!isApply) {
    console.log(`ℹ️  This was a DRY RUN simulation. No database records were modified.`);
    console.log(`👉 To execute the live migration, run:\n    npx tsx scripts/migrate-product-numbers.ts --apply\n`);
  } else {
    console.log(`✅ Live migration applied successfully! All products now have permanent product numbers and BOG barcodes.\n`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate-product-numbers.ts')) {
  runCli().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
