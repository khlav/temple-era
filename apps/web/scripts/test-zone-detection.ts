
import assert from "assert";

// Copied from src/components/raid-planner/raid-helper-import.tsx
function detectZoneFromTitle(title: string): string | null {
    const zonePatterns: Array<{ pattern: RegExp; zoneId: string }> = [
        { pattern: /\bbwl\b|blackwing/i, zoneId: "bwl" },
        { pattern: /\bmc\b|molten\s*core/i, zoneId: "mc" },
        { pattern: /\bnaxx?\b|naxxramas/i, zoneId: "naxxramas" },
        { pattern: /\bony\b|onyxia/i, zoneId: "onyxia" },
        { pattern: /\baq20\b|ruins/i, zoneId: "aq20" },
        { pattern: /\baq40\b|temple\s*of\s*ahn/i, zoneId: "aq40" },
        { pattern: /\bzg\b|zul.?gurub/i, zoneId: "zg" },
    ];

    let firstMatch: { index: number; zoneId: string } | null = null;

    for (const { pattern, zoneId } of zonePatterns) {
        const match = pattern.exec(title);
        if (match) {
            if (!firstMatch || match.index < firstMatch.index) {
                firstMatch = { index: match.index, zoneId };
            }
        }
    }

    return firstMatch?.zoneId ?? null;
}

// Test Case
const title = "Saturday WORLD TOUR @9PM - AQ40, BWL (MC?)";
const detected = detectZoneFromTitle(title);

console.log(`Title: "${title}"`);
console.log(`Detected: ${detected}`);
console.log(`Expected: aq40`);

if (detected === "aq40") {
    console.log("PASS");
} else {
    console.log("FAIL");
    process.exit(1);
}
