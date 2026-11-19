import assert from 'node:assert/strict';
import { test } from 'node:test';
import { barcodeFormats, labelPageGroups } from '../shared/printing.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BarcodePages } from '../src/BarcodePages.js';

test('thermal labels paginate individually and A4 batches preserve quantities without blank pages', () => {
  for (const [format, settings] of Object.entries(barcodeFormats)) {
    const labels = Array.from({ length: settings.perPage * 2 + 1 }, (_, index) => index);
    const pages = labelPageGroups(labels, format as keyof typeof barcodeFormats);
    assert.equal(pages.length, 3);
    assert.deepEqual(pages.flat(), labels);
    assert.ok(pages.every(page => page.length > 0 && page.length <= settings.perPage));
    assert.equal(labelPageGroups(labels.slice(0, settings.perPage * 2), format as keyof typeof barcodeFormats).length, 2);
    assert.deepEqual(labelPageGroups([], format as keyof typeof barcodeFormats), []);
  }
});

test('barcode pagination flattens React child arrays and skips conditional empty children', () => {
  const labels = Array.from({ length: 41 }, (_, index) => createElement('span', { key: index }, `Label ${index}`));
  const html = renderToStaticMarkup(createElement(BarcodePages, { format: 'a4-18', children: [labels, false, null] }));
  assert.equal((html.match(/class="barcode-sheet-printable sheet-a4-18"/g) || []).length, 3);
  assert.equal((html.match(/<span>/g) || []).length, 41);
  const thermal = renderToStaticMarkup(createElement(BarcodePages, { format: 'thermal-50x38', children: [labels.slice(0, 3), false] }));
  assert.equal((thermal.match(/class="barcode-sheet-printable sheet-thermal-50x38"/g) || []).length, 3);
});
