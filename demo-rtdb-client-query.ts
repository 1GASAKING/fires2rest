/**
 * RTDB Emulator Query Demo using the library's RTDB client
 *
 * Run with:
 *   npx tsx demo-rtdb-client-query.ts
 */

import { RTDB } from "./src/index.js";

// Connect to the RTDB emulator with the correct namespace.
const db = RTDB.useEmulator({
    emulatorHost: "127.0.0.1:9000",
    namespace: "demo-no-project",
});

async function main() {
    // Seed data
    await db.ref("users").set({
        alice: { age: 30, email: "alice@example.com" },
        bob: { age: 25, email: "bob@example.com" },
        carol: { age: 35, email: "carol@example.com" },
    });
    console.log("✅ Seeded /users");

    // Reference queries
    const usersRef = db.ref("users");

    let snap = await usersRef
        .orderByChild("age")
        .startAt(30)
        .limitToFirst(2)
        .get();
    console.log(
        "✅ orderByChild('age').startAt(30).limitToFirst(2):",
        JSON.stringify(snap.val()),
    );

    snap = await usersRef.orderByChild("age").equalTo(35).get();
    console.log("✅ equalTo(35):", JSON.stringify(snap.val()));

    await db.ref("users").remove();
    console.log("✅ Cleaned up");
}

main().catch((err) => {
    console.error("❌ Error:", err instanceof Error ? err.message : err);
    process.exit(1);
});
