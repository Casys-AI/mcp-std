/** Decode a gzip-compressed UTF-8 text asset with the portable Web Streams API. */
export function gunzipText(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const compressed = new Response(copy.buffer).body;
  if (!compressed) {
    throw new Error("Unable to read compressed UI asset");
  }

  const decompressed = compressed.pipeThrough(
    new DecompressionStream("gzip"),
  );
  return new Response(decompressed).text();
}

/**
 * Decode a fetched viewer asset whether the HTTP stack preserved gzip bytes or
 * transparently decoded a Content-Encoding header.
 */
export function decodeViewerText(bytes: Uint8Array): Promise<string> {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return gunzipText(bytes);
  }
  return Promise.resolve(new TextDecoder().decode(bytes));
}
