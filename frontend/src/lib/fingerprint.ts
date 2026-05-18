const STORAGE_KEY = "cw_fingerprint";

function fallbackUUID(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.getRandomValues) {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }
  return `fp-${Date.now()}-${Math.random().toString(16).slice(2, 14)}`;
}

export function getFingerprint(): string {
  if (typeof window === "undefined") return "";
  let fp = localStorage.getItem(STORAGE_KEY);
  if (!fp) {
    fp = globalThis.crypto?.randomUUID?.() ?? fallbackUUID();
    localStorage.setItem(STORAGE_KEY, fp);
  }
  return fp;
}
