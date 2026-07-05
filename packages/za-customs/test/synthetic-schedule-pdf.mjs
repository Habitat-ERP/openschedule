function pdfString(value) {
  return `(${value.replace(/[\\()]/g, "\\$&")})`;
}

export function syntheticSchedulePdf() {
  const items = [
    ["Date: 2026-05-29", 36, 565],
    ["0001.10", 39, 494],
    ["7", 118, 494],
    ["Synthetic goods", 142, 494],
    ["kg", 448, 494],
    ["10%", 486, 494],
    ["free", 640, 494]
  ];
  const content = items
    .map(([text, x, y]) => `BT /F1 8 Tf 1 0 0 1 ${x} ${y} Tm ${pdfString(text)} Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
