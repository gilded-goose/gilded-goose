// A real .xlsx with no library and no licence (Joshua, Nov 4: "Excel and CSV export of the threat log"). AG Grid's own Excel
// export is an Enterprise feature; the file format itself is open: a zip of a few XML files. Stored, not compressed, so this
// stays a screenful and needs nothing else on the page. It loads only when someone asks for the file.
// Every cell is an inline string, never a formula, so nothing in a cell can run when the file opens.

const enc = new TextEncoder();
const CRC = Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Stored zip entries: local headers, the bytes, a central directory, its end. */
function zip(files: readonly (readonly [string, string])[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let at = 0;
  const u16 = (v: DataView, o: number, x: number) => v.setUint16(o, x, true);
  const u32 = (v: DataView, o: number, x: number) => v.setUint32(o, x, true);
  for (const [name, text] of files) {
    const nameB = enc.encode(name);
    const body = enc.encode(text);
    const crc = crc32(body);
    const local = new Uint8Array(30 + nameB.length);
    const l = new DataView(local.buffer);
    u32(l, 0, 0x04034b50); u16(l, 4, 20); u16(l, 6, 0x0800); u16(l, 8, 0); u16(l, 10, 0); u16(l, 12, 0x21);
    u32(l, 14, crc); u32(l, 18, body.length); u32(l, 22, body.length); u16(l, 26, nameB.length); u16(l, 28, 0);
    local.set(nameB, 30);
    const c = new Uint8Array(46 + nameB.length);
    const v = new DataView(c.buffer);
    u32(v, 0, 0x02014b50); u16(v, 4, 20); u16(v, 6, 20); u16(v, 8, 0x0800); u16(v, 10, 0); u16(v, 12, 0); u16(v, 14, 0x21);
    u32(v, 16, crc); u32(v, 20, body.length); u32(v, 24, body.length); u16(v, 28, nameB.length); u32(v, 42, at);
    c.set(nameB, 46);
    parts.push(local, body);
    central.push(c);
    at += local.length + body.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  u32(e, 0, 0x06054b50); u16(e, 8, files.length); u16(e, 10, files.length); u32(e, 12, size); u32(e, 16, at);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let o = 0;
  for (const b of all) { out.set(b, o); o += b.length; }
  return out;
}

// Control characters aren't allowed in the format at all, so they go, whatever the cell held.
// eslint-disable-next-line no-control-regex
const xml = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

const cell = (text: string, col: number, row: number, style: number) => `<c r="${colName(col)}${row}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xml(text)}</t></is></c>`;

/** One sheet of plain text, its name the side it holds, its head bold and frozen, each column wide enough for its longest cell. */
export function xlsxOf(sheet: string, head: readonly string[], rows: readonly (readonly string[])[]): Uint8Array {
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const M = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const O = "application/vnd.openxmlformats-officedocument";
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  // Excel refuses a sheet name over 31 characters or holding any of these.
  const name = xml(sheet.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  const widths = head.map((h, i) => Math.min(60, Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)) + 2));
  const body = [
    `<row r="1">${head.map((h, i) => cell(h, i, 1, 1)).join("")}</row>`,
    ...rows.map((r, n) => `<row r="${n + 2}">${r.map((c, i) => cell(c, i, n + 2, 0)).join("")}</row>`),
  ].join("");
  return zip([
    ["[Content_Types].xml", `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${O}.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${O}.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${O}.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `${X}<workbook xmlns="${M}" xmlns:r="${R}"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `${X}<styleSheet xmlns="${M}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`],
    ["xl/worksheets/sheet1.xml", `${X}<worksheet xmlns="${M}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${body}</sheetData></worksheet>`],
  ]);
}
