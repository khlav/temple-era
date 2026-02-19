import { deflateRawSync } from "zlib";

/**
 * AACodec - AngryAssignments Codec
 *
 * Handles encoding of raid plan data for AngryAssignments WoW addon.
 * Format: AA:Category:1:<encoded_data>
 */
export class AACodec {
  private readonly BYTE_TO_6BIT =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()";

  /**
   * Escape special characters for AceSerializer-3.0 strings.
   * AceSerializer strips [%c ] (control characters and space) on deserialize,
   * so they must be escaped using ~ with an offset.
   */
  private escapeString(str: string): string {
    return str.replace(/[\x00-\x20\x5E\x7E\x7F]/g, (ch) => {
      const n = ch.charCodeAt(0);
      if (n === 30) return "~\x7A"; // Record Separator escapes to ~z
      if (n <= 32) return "~" + String.fromCharCode(n + 64);
      if (n === 94) return "~\x7D"; // ^ escapes to ~}
      if (n === 126) return "~\x7C"; // ~ escapes to ~|
      if (n === 127) return "~\x7B"; // DEL escapes to ~{
      return ch;
    });
  }

  /**
   * Serialize data using a subset of AceSerializer-3.0 format.
   */
  public serialize(v: any): string {
    const res: string[] = ["^1"];
    this.serializeValue(v, res);
    res.push("^^");
    return res.join("");
  }

  private serializeValue(v: any, res: string[]): void {
    const t = typeof v;

    if (t === "string") {
      res.push("^S", this.escapeString(v));
    } else if (t === "number") {
      res.push("^N", v.toString());
    } else if (t === "boolean") {
      res.push(v ? "^B" : "^b");
    } else if (v === null || v === undefined) {
      res.push("^Z");
    } else if (Array.isArray(v)) {
      res.push("^T");
      v.forEach((item, index) => {
        this.serializeValue(index + 1, res);
        this.serializeValue(item, res);
      });
      res.push("^t");
    } else if (t === "object") {
      res.push("^T");
      for (const key in v) {
        if (Object.prototype.hasOwnProperty.call(v, key)) {
          this.serializeValue(key, res);
          this.serializeValue(v[key], res);
        }
      }
      res.push("^t");
    }
  }

  /**
   * Encode binary data using LibDeflate's 6-bit encoding.
   */
  public encodeForPrint(data: Buffer): string {
    const result: string[] = [];
    let i = 0;
    const dataLen = data.length;

    while (i <= dataLen - 3) {
      const x1 = data[i]!;
      const x2 = data[i + 1]!;
      const x3 = data[i + 2]!;
      i += 3;

      let cache = x1 + x2 * 256 + x3 * 65536;
      const b1 = cache % 64;
      cache = Math.floor((cache - b1) / 64);
      const b2 = cache % 64;
      cache = Math.floor((cache - b2) / 64);
      const b3 = cache % 64;
      const b4 = Math.floor((cache - b3) / 64);

      result.push(
        this.BYTE_TO_6BIT[b1]!,
        this.BYTE_TO_6BIT[b2]!,
        this.BYTE_TO_6BIT[b3]!,
        this.BYTE_TO_6BIT[b4]!,
      );
    }

    let cache = 0;
    let cacheBitlen = 0;
    while (i < dataLen) {
      const x = data[i]!;
      cache = cache + x * Math.pow(2, cacheBitlen);
      cacheBitlen += 8;
      i += 1;
    }

    while (cacheBitlen > 0) {
      const bit6 = cache % 64;
      result.push(this.BYTE_TO_6BIT[bit6]!);
      cache = Math.floor((cache - bit6) / 64);
      cacheBitlen -= 6;
    }

    return result.join("");
  }

  /**
   * Complete AA encoding process.
   */
  public encode(data: any, type: "Category" | "Page" = "Category"): string {
    const serialized = this.serialize(data);
    const dataBytes = Buffer.from(serialized, "utf-8");
    const compressed = deflateRawSync(dataBytes, { level: 9 });
    const encoded = this.encodeForPrint(compressed);

    return `AA:${type}:1:${encoded}`;
  }
}
