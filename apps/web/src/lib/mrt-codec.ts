import { inflateRawSync, deflateRawSync } from "zlib";

/**
 * MRT (Method Raid Tools) Codec
 *
 * Handles encoding/decoding of MRT raid group data.
 *
 * MRT Format:
 * 1. Header: "MRTRGR" or "EXRTRGR"
 * 2. Compression flag: "0" (uncompressed) or "1" (compressed)
 * 3. Data: 6-bit encoded (LibDeflate:EncodeForPrint) deflate-compressed table data
 *
 * LibDeflate uses a custom 6-bit encoding (NOT Base64):
 * - Takes 3 bytes (24 bits) and converts to 4 characters (4x6 = 24 bits)
 * - Character set: a-z, A-Z, 0-9, (, )  (64 chars total)
 * - This makes the strings safe for WoW's chat/addon communication
 */
export class MRTCodec {
  private readonly BYTE_TO_6BIT =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()";
  private readonly _6BIT_TO_BYTE: Record<number, number>;

  constructor() {
    // Build reverse mapping for decoding
    this._6BIT_TO_BYTE = {};
    for (let i = 0; i < this.BYTE_TO_6BIT.length; i++) {
      this._6BIT_TO_BYTE[this.BYTE_TO_6BIT.charCodeAt(i)] = i;
    }
  }

  /**
   * Encode binary data using LibDeflate's 6-bit encoding.
   * Equivalent to LibDeflate:EncodeForPrint()
   */
  private encodeForPrint(data: Buffer): string {
    const result: string[] = [];
    let i = 0;
    const dataLen = data.length;

    // Process 3 bytes at a time (main loop)
    while (i <= dataLen - 3) {
      const x1 = data[i]!;
      const x2 = data[i + 1]!;
      const x3 = data[i + 2]!;
      i += 3;

      // Combine 3 bytes into 24-bit cache
      let cache = x1 + x2 * 256 + x3 * 65536;

      // Extract four 6-bit values
      const b1 = cache % 64;
      cache = Math.floor((cache - b1) / 64);
      const b2 = cache % 64;
      cache = Math.floor((cache - b2) / 64);
      const b3 = cache % 64;
      const b4 = Math.floor((cache - b3) / 64);

      // Convert to characters
      result.push(
        this.BYTE_TO_6BIT[b1]!,
        this.BYTE_TO_6BIT[b2]!,
        this.BYTE_TO_6BIT[b3]!,
        this.BYTE_TO_6BIT[b4]!,
      );
    }

    // Handle remaining bytes
    let cache = 0;
    let cacheBitlen = 0;
    while (i < dataLen) {
      const x = data[i]!;
      cache = cache + x * Math.pow(2, cacheBitlen);
      cacheBitlen += 8;
      i += 1;
    }

    // Output remaining bits as 6-bit chunks
    while (cacheBitlen > 0) {
      const bit6 = cache % 64;
      result.push(this.BYTE_TO_6BIT[bit6]!);
      cache = Math.floor((cache - bit6) / 64);
      cacheBitlen -= 6;
    }

    return result.join("");
  }

  /**
   * Decode a 6-bit encoded string back to binary data.
   * Equivalent to LibDeflate:DecodeForPrint()
   */
  private decodeForPrint(encoded: string): Buffer {
    // Strip leading/trailing whitespace
    encoded = encoded.trim();

    const result: number[] = [];
    let i = 0;
    const strLen = encoded.length;

    // Process 4 characters at a time (main loop)
    while (i <= strLen - 4) {
      const c1 = encoded.charCodeAt(i);
      const c2 = encoded.charCodeAt(i + 1);
      const c3 = encoded.charCodeAt(i + 2);
      const c4 = encoded.charCodeAt(i + 3);

      // Convert characters to 6-bit values
      const x1 = this._6BIT_TO_BYTE[c1];
      const x2 = this._6BIT_TO_BYTE[c2];
      const x3 = this._6BIT_TO_BYTE[c3];
      const x4 = this._6BIT_TO_BYTE[c4];

      if (
        x1 === undefined ||
        x2 === undefined ||
        x3 === undefined ||
        x4 === undefined
      ) {
        throw new Error(`Invalid character in encoded string at position ${i}`);
      }

      i += 4;

      // Combine four 6-bit values into 24-bit cache
      let cache = x1 + x2 * 64 + x3 * 4096 + x4 * 262144;

      // Extract three bytes
      const b1 = cache % 256;
      cache = Math.floor((cache - b1) / 256);
      const b2 = cache % 256;
      const b3 = Math.floor((cache - b2) / 256);

      result.push(b1, b2, b3);
    }

    // Handle remaining characters
    let cache = 0;
    let cacheBitlen = 0;
    while (i < strLen) {
      const c = encoded.charCodeAt(i);
      const x = this._6BIT_TO_BYTE[c];
      if (x === undefined) {
        throw new Error(`Invalid character in encoded string at position ${i}`);
      }

      cache = cache + x * Math.pow(2, cacheBitlen);
      cacheBitlen += 6;
      i += 1;
    }

    // Output remaining bytes
    while (cacheBitlen >= 8) {
      const b = cache % 256;
      result.push(b);
      cache = Math.floor((cache - b) / 256);
      cacheBitlen -= 8;
    }

    return Buffer.from(result);
  }

  /**
   * Parse a simple Lua table string into a JavaScript object.
   * Formats supported:
   * 1. "0,{[1]='Name1',[2]='Name2',...}"  (indexed format)
   * 2. "0,{\"Name1\",\"Name2\",...}"        (array format)
   */
  private parseLuaTable(data: string): Record<number, string> {
    // Remove the version prefix (e.g., "0,")
    let tableStr: string;
    if (data.includes(",")) {
      const parts = data.split(",");
      tableStr = parts.slice(1).join(",");
    } else {
      tableStr = data;
    }

    const result: Record<number, string> = {};

    // Remove outer braces
    tableStr = tableStr.trim();
    if (tableStr.startsWith("{") && tableStr.endsWith("}")) {
      tableStr = tableStr.substring(1, tableStr.length - 1);
    }

    // Try format 1: [index]='value' or [index]="value"
    const pattern1 = /\[(\d+)\]\s*=\s*['"]([^'"]*)['"]/g;
    let matches = [...tableStr.matchAll(pattern1)];

    if (matches.length > 0) {
      for (const match of matches) {
        result[parseInt(match[1]!)] = match[2]!;
      }
    } else {
      // Try format 2: "value1","value2","value3"...
      // This is an array format, index starts at 1
      const pattern2 = /"([^"]*)"/g;
      matches = [...tableStr.matchAll(pattern2)];
      let index = 1;
      for (const match of matches) {
        result[index] = match[1]!;
        index++;
      }
    }

    return result;
  }

  /**
   * Create a Lua table string from a JavaScript object.
   * Format: "0,{\"Name1\",\"Name2\",...}"  (array format used by MRT)
   */
  private createLuaTable(data: Record<number, string>): string {
    // Create entries in order
    const entries: string[] = [];
    const keys = Object.keys(data)
      .map((k) => parseInt(k))
      .sort((a, b) => a - b);

    for (const key of keys) {
      let value = data[key]!;
      // Escape quotes and backslashes in the value
      value = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      entries.push(`"${value}"`);
    }

    const tableStr = "{" + entries.join(",") + "}";
    return `0,${tableStr}`;
  }

  /**
   * Decode an MRT raid group string.
   *
   * @param mrtString - The MRT-encoded string
   * @returns Object with raid composition data and compression flag
   */
  decode(mrtString: string): {
    data: Record<number, string>;
    compressed: boolean;
  } {
    // Check header
    if (!mrtString.startsWith("MRTRGR") && !mrtString.startsWith("EXRTRGR")) {
      throw new Error("Invalid MRT string: missing MRTRGR/EXRTRGR header");
    }

    const headerLen = mrtString.startsWith("MRTRGR") ? 7 : 8;
    const header = mrtString.substring(0, headerLen);
    const compressionFlag = header[headerLen - 1];

    if (compressionFlag !== "0" && compressionFlag !== "1") {
      throw new Error(`Invalid compression flag: ${compressionFlag}`);
    }

    const isCompressed = compressionFlag === "1";

    // Get the encoded data (everything after header)
    const encodedData = mrtString.substring(headerLen);

    // Decode from 6-bit encoding
    const decodedBytes = this.decodeForPrint(encodedData);

    // Decompress if needed
    let dataStr: string;
    if (isCompressed) {
      const decompressed = inflateRawSync(decodedBytes);
      dataStr = decompressed.toString("utf-8");
    } else {
      dataStr = decodedBytes.toString("utf-8");
    }

    // Parse Lua table
    const raidData = this.parseLuaTable(dataStr);

    return {
      data: raidData,
      compressed: isCompressed,
    };
  }

  /**
   * Encode raid data into MRT format.
   *
   * @param raidData - Object mapping position (1-40) to player name
   * @param compress - Whether to compress the data (default: true)
   * @returns MRT-encoded string
   */
  encode(raidData: Record<number, string>, compress = true): string {
    // Create Lua table string
    const luaTable = this.createLuaTable(raidData);

    // Convert to buffer
    const dataBytes = Buffer.from(luaTable, "utf-8");

    // Compress if requested and beneficial
    let finalData: Buffer;
    let compressionFlag: string;
    if (compress && dataBytes.length < 1000000) {
      // Use deflate compression (level 5 matches MRT)
      finalData = deflateRawSync(dataBytes, { level: 5 });
      compressionFlag = "1";
    } else {
      finalData = dataBytes;
      compressionFlag = "0";
    }

    // Encode using 6-bit encoding
    const encoded = this.encodeForPrint(finalData);

    // Add header
    const mrtString = `MRTRGR${compressionFlag}${encoded}`;

    return mrtString;
  }
}

/**
 * Example MRT raid group string for testing.
 * This is a real encoded raid composition with compression enabled.
 */
export const EXAMPLE_MRT_STRING =
  "MRTRGR1vjvZojqmq43foZM4RGaQjQGeKKn4TXUdSL2TdzABwqJx8PXNaV5P9fZzXeC2tDY3833330Rg)(OxihdfZHGJTUrJhnHZgS1695yXsyNhfS1WoKzvrRZ8oiibLq72Sxc2G91uuIX0wW3JSKsyiDGOuu15JefIY71CIylCev5UhdbRg45a4WJfL2qverhYc2ks2CLQOBAAKfM0sWdvyQ1ghakDHEKjf2upzCTe7uyZGglPz80ARd81zEV2bwHrd10Kd24q(nbyYiVli6vmruVtamtPbndgr(dyNXzdPASco13menDFRYVaFlpumIBRz5DuibHlxSUpf2DqLFU176(IpB9neJEBF4eeJiShoPjh0urMAj62J5)NyznDWJAv8WFxCT4Nb2y3p6FbpXMey0M(gzGITRpZI0n1NL0f0p(9";
