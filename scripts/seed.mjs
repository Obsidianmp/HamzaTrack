import { copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const source = path.join(root, "data", "db.json");
const target = path.join(root, "data", "db.local.json");

await copyFile(source, target);
console.log(`Seeded ${target}`);
