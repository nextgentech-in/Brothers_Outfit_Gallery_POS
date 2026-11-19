import { barcodeFormats, type LabelFormat } from '../shared/printing';

export function BarcodeFormatPicker({ value, onChange }: { value: LabelFormat; onChange: (value: LabelFormat) => void }) {
  return <div className="barcode-setting-group">
    <label>Label format & size
      <select value={value} onChange={event => onChange(event.target.value as LabelFormat)}>
        {Object.entries(barcodeFormats).map(([key, format]) => <option key={key} value={key}>{format.label}</option>)}
      </select>
    </label>
    <button className="text-button" type="button" onClick={() => onChange('thermal-50x38')}>Use shop default</button>
    <small>Load matching labels. Print at 100% scale with margins and headers off. Select your printer in the print dialog.</small>
  </div>;
}
