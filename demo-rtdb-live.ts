/**
 * Live Realtime Database Demo
 *
 * Tests the RTDB client against a REAL Firebase Realtime Database
 * using the service account credentials in .env.
 *
 * Run with:
 *   npx tsx demo-rtdb-live.ts
 */

import { config } from "dotenv";
import { RTDB } from "./src/index.js";

config();

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
    console.error("❌ Missing required env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).");
    process.exit(1);
}

const db = RTDB.useServiceAccount(projectId, {
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
});

// Use a unique path so we don't collide with existing data
const testPath = `fires2rest-live-test/${Date.now()}`;
const ref = db.ref(testPath);

async function main() {
    console.log(`🟢 Connected to RTDB for project: ${projectId}`);
    console.log(`📝 Using test path: ${ref.path}\n`);

    // 1. Write
    await ref.set({
        message: "Hello from fires2rest live RTDB!",
        createdAt: new Date().toISOString(),
        count: 42,
        nested: { tags: ["a", "b"] },
    });
    console.log("✅ set() succeeded");

    // 2. Read
    let snap = await ref.get();
    console.log("✅ get() succeeded:", JSON.stringify(snap.val()));
    if (!snap.exists) throw new Error("Snapshot should exist");

    // 3. Nested child read
    snap = await ref.child("nested").get();
    if (snap.exists) {
        console.log("✅ child('nested').get():", JSON.stringify(snap.val()));
    }

    // 4. Update
    await ref.update({ count: 43, extra: "field" });
    snap = await ref.get();
    console.log("✅ update() succeeded:", JSON.stringify(snap.val()));

    // 5. Cleanup
    await ref.remove();
    console.log("\n✅ remove() cleanup succeeded");
}

main()
    .then(() => console.log("\n🎉 Live RTDB test passed!"))
    .catch((err) => {
        console.error("\n❌ Live RTDB test failed:", err instanceof Error ? err.message : err);
        // Best-effort cleanup
        ref.remove().catch(() => {});
        process.exit(1);
    });
