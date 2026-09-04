/**
 * RTDB Emulator Demo
 *
 * Tests reading from the Firebase Realtime Database emulator using the
 * new RTDB client in this library.
 *
 * Run with:
 *   npx tsx demo-rtdb-emulator.ts
 */

import { RTDB } from "./src/index.js";

// ============================================================
// 1. Connect to the RTDB emulator (running on port 9000)
// ============================================================
const db = RTDB.useEmulator({
    emulatorHost: "127.0.0.1:9000",
});

// ============================================================
// 2. Basic CRUD operations
// ============================================================

const usersRef = db.ref("users");

// PUT a whole tree
await usersRef.set({
    alice: { age: 30, email: "alice@example.com" },
    bob: { age: 25, email: "bob@example.com" },
    carol: { age: 35, email: "carol@example.com" },
});
console.log("✅ set(users)");

// GET the whole tree
let snap = await usersRef.get();
console.log("✅ get(users):", JSON.stringify(snap.val()));

// GET a single nested child
snap = await db.ref("users/alice").get();
console.log("✅ get(users/alice):", JSON.stringify(snap.val()));
console.log("   exists:", snap.exists, "| key:", snap.key);

// Child snapshot helpers
const aliceChild = snap.child("email");
console.log("   child('email').val():", aliceChild.val());

// PUSH a new child with auto-generated ID
const pushedRef = await db.ref("users").push({
    age: 40,
    email: "dave@example.com",
});
console.log("✅ push(users):", pushedRef.key, pushedRef.path);

// UPDATE specific fields (set null to delete)
await usersRef.update({ bob: null });
console.log("✅ update(users) removed bob");

// Read back after updates
snap = await usersRef.get();
console.log("✅ get(users) after update:", JSON.stringify(snap.val()));

// ============================================================
// 3. Collection iteration with snapshot helper methods
// ============================================================


snap = await usersRef.get();
console.log("\n📋 Iterating over users:");
snap.forEach((child) => {
    console.log(`   - ${child.key}: ${JSON.stringify(child.val())}`);
});
console.log("   numChildren:", snap.numChildren());
console.log("   keys:", snap.keys.join(", "));

// ============================================================
// 4. Cleanup
// ============================================================

await usersRef.remove();
console.log("\n✅ Removed /users");
snap = await usersRef.get();
console.log("   exists after removal:", snap.exists);

console.log("\n🎉 RTDB emulator demo complete!");
