import ExcelJS from "exceljs";

/**
 * Parses the first worksheet of an xlsx/xls ArrayBuffer into a list of plain
 * objects keyed by column header — same shape as `XLSX.utils.sheet_to_json()`.
 *
 * Replaces the `xlsx` package, which has unfixed Prototype Pollution + ReDoS
 * vulnerabilities. `exceljs` is actively maintained and free of those CVEs.
 */
export async function parseXlsxBuffer(
  buffer: ArrayBuffer | Uint8Array
): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs.load accepts ArrayBuffer in browser path. Normalize Uint8Array.
  const ab: ArrayBuffer = buffer instanceof ArrayBuffer
    ? buffer
    : new Uint8Array(buffer).slice().buffer;
  // Cast: exceljs types expect Node Buffer but runtime accepts ArrayBuffer in browser build.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(ab as any);

  const ws = wb.worksheets[0];
  if (!ws) return [];

  // Build header map from row 1
  const headers: string[] = [];
  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: Record<string, unknown>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const obj: Record<string, unknown> = {};
    let hasAny = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      let value: unknown = cell.value;
      // exceljs returns richer objects for some types — normalize to primitives
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        if ("text" in v) value = v.text;
        else if ("result" in v) value = v.result;     // formula
        else if ("richText" in v && Array.isArray(v.richText)) {
          value = v.richText.map((rt: { text: string }) => rt.text).join("");
        } else if (v instanceof Date) {
          // Date objects passed through as-is (Date already handled below)
        }
      }
      if (value instanceof Date) {
        value = value.toISOString().slice(0, 10);
      }
      obj[key] = value ?? "";
      if (value !== undefined && value !== null && value !== "") hasAny = true;
    });
    // Fill any header columns missing from this row with empty string (sheet_to_json parity with defval)
    for (const h of headers) {
      if (h && !(h in obj)) obj[h] = "";
    }
    if (hasAny) rows.push(obj);
  });

  return rows;
}
