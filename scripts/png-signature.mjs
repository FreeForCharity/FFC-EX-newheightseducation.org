/**
 * The PNG signature check shared by the scripts that write PNGs into public/.
 *
 * It lives in its own module so that no generator has to import another one
 * for a helper that happened to be defined there first.
 */

/** The full 8-byte PNG signature: \x89 P N G \r \n \x1a \n. */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * True only for a Buffer whose first 8 bytes are the PNG signature.
 *
 * ALL EIGHT BYTES, not the `PNG` in the middle of them. The previous check
 * here was `bytes.subarray(1, 4).toString('latin1') === 'PNG'` -- three ASCII
 * letters, which occur by accident in plenty of binary data. Its whole job is
 * to stop something that is not a PNG being written into public/, where it
 * would next be noticed in a browser, months later.
 *
 * The trailing bytes are the load-bearing part rather than padding: `\r\n`
 * and `\x1a` are in the signature precisely so that a transport which mangles
 * line endings, or truncates at a DOS end-of-file, corrupts the signature
 * instead of silently corrupting the image data. The old check ignored
 * exactly the bytes chosen to catch that.
 *
 * A SHORT BUFFER IS HANDLED, AND NOT BY AN EXPLICIT LENGTH CHECK. Writing
 * `bytes.length >= 8 && ...` looks like the careful version and is dead code:
 * `Buffer.subarray` clamps rather than throwing, so a 3-byte buffer is
 * compared as a 3-byte subarray and `equals` is already false because the
 * lengths differ. It is left out rather than kept for reassurance, because a
 * condition that can never be false reads as protection while providing none.
 * The short-buffer cases are still asserted in the test: they pin the
 * BEHAVIOUR, which is what callers depend on, however it is delivered.
 *
 * `Buffer.isBuffer` is not redundant in the same way -- a plain Uint8Array
 * has no `.equals`, so without it this throws rather than returning false.
 */
export function isPng(bytes) {
  return Buffer.isBuffer(bytes) && bytes.subarray(0, 8).equals(PNG_SIGNATURE)
}
