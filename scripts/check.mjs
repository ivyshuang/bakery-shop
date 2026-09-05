import { execFileSync } from "node:child_process";
import fs from "node:fs";

const jsFiles = [
  "public/app.js",
  "public/admin/admin.js",
  "functions/api/products.js",
  "functions/api/order.js",
  "functions/api/admin/_middleware.js",
  "functions/api/admin/orders.js",
  "functions/api/admin/order/[id].js",
  "functions/api/admin/products.js",
  "functions/api/admin/product/[id].js"
];

for (const rel of jsFiles) {
  if (!fs.existsSync(rel)) throw new Error(`Missing: ${rel}`);
  execFileSync(process.execPath, ["--check", rel], { stdio: "inherit" });
  console.log(`OK ${rel}`);
}
console.log("All JavaScript files passed syntax checks.");
