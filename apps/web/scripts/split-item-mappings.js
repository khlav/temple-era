import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFile = path.join(__dirname, '../src/lib/item-mappings.ts');
const outputDir = path.join(__dirname, '../src/lib/item-mappings');

// Read the TypeScript file
const content = fs.readFileSync(inputFile, 'utf8');

// Extract the ITEM_MAPPINGS object content
const itemsMatch = content.match(/export const ITEM_MAPPINGS: Record<number, ItemMapping> = \{([\s\S]*)\} as const;/);
if (!itemsMatch) {
  console.error('Could not find ITEM_MAPPINGS in the file');
  process.exit(1);
}

const itemsText = itemsMatch[1];

// Parse items - find all item entries
const itemPattern = /\[(\d+)\]:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
const itemsByInstance = {};

let match;
while ((match = itemPattern.exec(itemsText)) !== null) {
  const itemId = match[1];
  const itemContent = match[2];
  
  if (!itemId || !itemContent) {
    continue;
  }
  
  // Extract fields using regex
  const idMatch = itemContent.match(/id:\s*(\d+)/);
  const nameMatch = itemContent.match(/name:\s*"([^"]+)"/);
  const equipslotMatch = itemContent.match(/equipslot:\s*"([^"]+)"/);
  const qualityMatch = itemContent.match(/quality:\s*"([^"]+)"/);
  const ilvlMatch = itemContent.match(/ilvl:\s*(\d+)/);
  const fromMatch = itemContent.match(/from:\s*"([^"]+)"/);
  const instanceMatch = itemContent.match(/instance:\s*"([^"]+)"/);
  
  if (!idMatch || !nameMatch || !equipslotMatch || !qualityMatch || !ilvlMatch || !fromMatch || !instanceMatch) {
    console.warn(`Skipping item ${itemId} - missing required fields`);
    continue;
  }
  
  const instance = instanceMatch[1];
  if (!instance) {
    console.warn(`Skipping item ${itemId} - no instance found`);
    continue;
  }
  
  const item = {
    id: parseInt(idMatch[1], 10),
    name: nameMatch[1],
    equipslot: equipslotMatch[1],
    quality: qualityMatch[1],
    ilvl: parseInt(ilvlMatch[1], 10),
    from: fromMatch[1],
    instance: instance,
  };
  
  if (!itemsByInstance[instance]) {
    itemsByInstance[instance] = {};
  }
  
  itemsByInstance[instance][item.id] = item;
}

// Write JSON files for each instance
let totalItems = 0;
for (const [instance, items] of Object.entries(itemsByInstance)) {
  const itemCount = Object.keys(items).length;
  totalItems += itemCount;
  const outputFile = path.join(outputDir, `${instance}.json`);
  fs.writeFileSync(
    outputFile,
    JSON.stringify(items, null, 2),
    'utf8'
  );
  console.log(`Created ${outputFile} with ${itemCount} items`);
}

console.log(`\nTotal items processed: ${totalItems}`);
console.log(`Total instances: ${Object.keys(itemsByInstance).length}`);
