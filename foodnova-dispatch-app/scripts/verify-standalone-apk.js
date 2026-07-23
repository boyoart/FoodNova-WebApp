const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const apk = resolve(process.argv[2] || "android/app/build/outputs/apk/release/app-release.apk");

if (!existsSync(apk)) {
  console.error(`Release APK not found: ${apk}`);
  process.exit(1);
}

const listing = spawnSync("jar", ["tf", apk], { encoding: "utf8" });
if (listing.error || listing.status !== 0) {
  console.error("Unable to inspect the APK. Ensure the JDK 'jar' command is available.");
  if (listing.stderr) console.error(listing.stderr.trim());
  process.exit(1);
}

if (!listing.stdout.split(/\r?\n/).includes("assets/index.android.bundle")) {
  console.error("INVALID APK: assets/index.android.bundle is missing. This APK requires Metro and is not standalone.");
  process.exit(1);
}

console.log(`Standalone Dispatch APK verified: ${apk}`);
console.log("Embedded JavaScript bundle: assets/index.android.bundle");
