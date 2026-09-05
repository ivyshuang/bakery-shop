import { execFileSync } from "node:child_process";
import fs from "node:fs";

const jsFiles = [
  "public/app.js",
  "public/admin/admin.js",
  "src/index.js",
  "src/handlers/products.js",
  "src/handlers/order.js",
  "src/handlers/admin/orders.js",
  "src/handlers/admin/order.js",
  "src/handlers/admin/products.js",
  "src/handlers/admin/product.js"
];

for (const rel of jsFiles) {
  if (!fs.existsSync(rel)) throw new Error(`Missing: ${rel}`);
  execFileSync(process.execPath, ["--check", rel], { stdio: "inherit" });
  console.log(`OK ${rel}`);
}
console.log("All JavaScript files passed syntax checks.");
