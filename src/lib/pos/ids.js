// Time-ordered UUID (v7) so records created on different machines never clash
// and still sort roughly by creation time. Replaces the old Date.now()-based
// ids, which could collide as soon as two terminals sell at the same moment.

function randomBytes(n) {
  const bytes = new Uint8Array(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

export function uuidv7() {
  const b = randomBytes(16);
  const ts = Date.now(); // 48-bit millisecond timestamp
  b[0] = Math.floor(ts / 2 ** 40) & 0xff;
  b[1] = Math.floor(ts / 2 ** 32) & 0xff;
  b[2] = Math.floor(ts / 2 ** 24) & 0xff;
  b[3] = Math.floor(ts / 2 ** 16) & 0xff;
  b[4] = Math.floor(ts / 2 ** 8) & 0xff;
  b[5] = ts & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// newId("s") -> "s-0192f3a1-...". The prefix keeps ids readable in the database.
export function newId(prefix) {
  return `${prefix}-${uuidv7()}`;
}
