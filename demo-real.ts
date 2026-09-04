/**
 * Live Firestore Client Demo
 *
 * Tests reading from a REAL Firebase Firestore project using fires2rest.
 *
 * Run with:
 *   npx tsx demo-real.ts
 */

import { config } from "dotenv";
import { Firestore } from "./src/index.js";

config();

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
    console.error("❌ Missing required environment variables.");
    console.error("   Please check your .env file.");
    process.exit(1);
}

// ============================================================
// 1. Initialize the live Firestore client
// ============================================================
const db = Firestore.useServiceAccount(projectId, {
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
});

// ============================================================
// 2. Test read operations (change paths to real collections/docs)
// ============================================================
const candidates = [
    "users/test-user",
    "users/alice",
    "test/test-doc",
    "fires2rest-demo/read-test",
];

for (const path of candidates) {
    console.log(`\n📖 Reading document: ${path}`);
    const snap = await db.doc(path).get();
    console.log(`   exists: ${snap.exists}`);

    if (snap.exists) {
        console.log("   data:", JSON.stringify(snap.data(), null, 4));
        break;
    }
    console.log("   (not found)");
}

// ============================================================
// 3. Test write + read-back (creates a fresh doc)
// ============================================================
const demoDocPath = "fires2rest-demo/read-test";
console.log(`\n📝 Writing test document: ${demoDocPath}`);

try {
    await db.doc(demoDocPath).set({
        message: "Hello from fires2rest! 👋",
        createdAt: new Date().toISOString(),
        source: "demo-real.ts",
    });
    console.log("   ✅ Write successful!");

    console.log(`\n📖 Reading back document: ${demoDocPath}`);
    const snap = await db.doc(demoDocPath).get();
    if (snap.exists) {
        console.log("   ✅ Read successful!");
        console.log("   data:", JSON.stringify(snap.data(), null, 4));
    } else {
        console.log("   ❌ Document not found after write.");
    }
} catch (err) {
    console.error("   ❌ Error:", err instanceof Error ? err.message : err);
}

console.log("\n✅ Demo complete.");
