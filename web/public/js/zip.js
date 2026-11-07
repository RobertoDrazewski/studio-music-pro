// Escritor de ZIP mínimo (sin compresión, método "store"). El audio ya viene denso, así que guardar sin comprimir alcanza
// y deja el código chico. Las entradas son Blobs, así el navegador puede paginar archivos grandes fuera de memoria.
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

async function blobCrc(blob) {
  // Leo por partes para no tener dos copias de un archivo grande en memoria.
  let crc = 0;
  const CH = 4 * 1024 * 1024;
  for (let o = 0; o < blob.size; o += CH) crc = crc32(new Uint8Array(await blob.slice(o, o + CH).arrayBuffer()), crc);
  return crc;
}

const enc = new TextEncoder();
function dosTime(d = new Date()) {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

// files: [{ name, data: Blob | string | Uint8Array }]. Devuelvo un Blob (application/zip).
export async function makeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosTime();
  for (const f of files) {
    const data = f.data instanceof Blob ? f.data : new Blob([typeof f.data === 'string' ? enc.encode(f.data) : f.data]);
    const name = enc.encode(f.name);
    const crc = await blobCrc(data);
    if (data.size > 0xfffffffe || offset > 0xfffffffe) throw new Error('The pack is too large for a ZIP. Export fewer stems or use 16-bit.');
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true);
    head.setUint16(10, time, true); head.setUint16(12, date, true); head.setUint32(14, crc, true);
    head.setUint32(18, data.size, true); head.setUint32(22, data.size, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    parts.push(head.buffer, name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true); cd.setUint16(14, date, true); cd.setUint32(16, crc, true); cd.setUint32(20, data.size, true); cd.setUint32(24, data.size, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
    central.push(cd.buffer, name);
    offset += 30 + name.length + data.size;
  }
  const cdSize = central.reduce((n, p) => n + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
