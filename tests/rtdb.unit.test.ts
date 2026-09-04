/**
 * Realtime Database Unit Tests
 *
 * Tests for URL building, reference handling, snapshot behavior, and
 * REST request serialization. Network calls are mocked so these tests
 * do NOT require a running emulator.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { RTDB, RTDBDataSnapshot, RTDBQuery } from "../src/rtdb.js";

// ============================================================================
// Mock Fetch Helpers
// ============================================================================

function createMockedFetch(status = 200, body: unknown = {}) {
    const mock = vi.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    }));
    vi.stubGlobal("fetch", mock);
    return mock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

// ============================================================================
// URL Building Tests
// ============================================================================

describe("RTDB URL building", () => {
    it("builds the root URL", () => {
        const db = RTDB.useEmulator({ emulatorHost: "http://localhost:9000" });
        expect(db._buildRESTUrl("/")).toBe("http://localhost:9000/.json");
    });

    it("builds a URL for a nested path", () => {
        const db = RTDB.useEmulator({ emulatorHost: "http://localhost:9000" });
        expect(db._buildRESTUrl("users/alice")).toBe(
            "http://localhost:9000/users/alice.json",
        );
    });

    it("normalizes leading and trailing slashes", () => {
        const db = RTDB.useEmulator({ emulatorHost: "http://localhost:9000" });
        expect(db._buildRESTUrl("//users/alice/")).toBe(
            "http://localhost:9000/users/alice.json",
        );
    });

    it("appends the namespace as the ns query parameter", () => {
        const db = RTDB.useEmulator({
            emulatorHost: "http://localhost:9000",
            namespace: "demo-no-project",
        });
        expect(db._buildRESTUrl("users")).toBe(
            "http://localhost:9000/users.json?ns=demo-no-project",
        );
    });

    it("does not duplicate http:// when host already has a scheme", () => {
        const db = RTDB.useEmulator({
            emulatorHost: "https://my-app.firebaseio.com",
        });
        expect(db._buildRESTUrl("users")).toBe(
            "https://my-app.firebaseio.com/users.json",
        );
    });
});
// ============================================================================
// Reference Tests
// ============================================================================

describe("RTDBReference", () => {
    const db = RTDB.useEmulator({ emulatorHost: "http://localhost:9000" });

    it("normalizes the stored path", () => {
        expect(db.ref("users/alice").path).toBe("/users/alice");
        expect(db.ref("/users/alice/").path).toBe("/users/alice");
        expect(db.ref("/").path).toBe("/");
    });

    it("exposes the key of the final segment", () => {
        expect(db.ref("users/alice").key).toBe("alice");
        expect(db.ref("/").key).toBeNull();
    });

    it("traverses to the parent reference", () => {
        const ref = db.ref("users/alice");
        expect(ref.parent?.path).toBe("/users");
        expect(ref.parent?.parent?.path).toBe("/");
        expect(ref.parent?.parent?.parent).toBeNull();
    });

    it("provides the root reference", () => {
        expect(db.ref("users/alice/orders/1").root.path).toBe("/");
        expect(db.root.path).toBe("/");
    });

    it("creates child references with relative and absolute paths", () => {
        const ref = db.ref("users");
        expect(ref.child("alice").path).toBe("/users/alice");
        expect(ref.child("/alice/").path).toBe("/users/alice");
        expect(ref.child("").path).toBe("/users");
    });

    it("supports doc() as an alias of ref()", () => {
        expect(db.doc("users/alice").path).toBe("/users/alice");
    });
});

// ============================================================================
// Snapshot Tests
// ============================================================================

describe("RTDBDataSnapshot", () => {
    const db = RTDB.useEmulator({ emulatorHost: "http://localhost:9000" });

    it("exposes the value and existence state", () => {
        const ref = db.ref("users/alice");
        const snapshot = new RTDBDataSnapshot({ name: "Alice" }, ref);

        expect(snapshot.exists).toBe(true);
        expect(snapshot.val()).toEqual({ name: "Alice" });
        expect(snapshot.key).toBe("alice");
        expect(snapshot.ref).toBe(ref);
    });

    it("treats null and undefined as empty snapshots", () => {
        const ref = db.ref("users/alice");
        expect(new RTDBDataSnapshot(null, ref).exists).toBe(false);
        expect(new RTDBDataSnapshot(null, ref).val()).toBeNull();
        expect(new RTDBDataSnapshot(undefined, ref).exists).toBe(false);
    });

    it("returns children and child values", () => {
        const ref = db.ref("users/alice");
        const snapshot = new RTDBDataSnapshot({ name: "Alice", age: 30 }, ref);

        const nameChild = snapshot.child("name");
        expect(nameChild.val()).toBe("Alice");
        expect(nameChild.exists).toBe(true);
        expect(nameChild.key).toBe("name");

        expect(snapshot.child("missing").exists).toBe(false);
        expect(snapshot.hasChild("name")).toBe(true);
        expect(snapshot.hasChild("missing")).toBe(false);
    });

    it("counts and iterates children", () => {
        const ref = db.ref("users/alice");
        const snapshot = new RTDBDataSnapshot({ name: "Alice", age: 30 }, ref);

        expect(snapshot.numChildren()).toBe(2);
        expect(snapshot.hasChildren()).toBe(true);
        expect(snapshot.keys).toEqual(["name", "age"]);

        const visited: string[] = [];
        snapshot.forEach((child) => visited.push(child.key ?? ""));
        expect(visited).toEqual(["name", "age"]);
    });

    it("returns zero children for non-object values", () => {
        const ref = db.ref("users/alice");
        expect(new RTDBDataSnapshot(42, ref).numChildren()).toBe(0);
        expect(new RTDBDataSnapshot(42, ref).hasChildren()).toBe(false);
    });
});
// ============================================================================
// Request Tests (mocked fetch)
// ============================================================================

describe("RTDB requests", () => {
    const db = RTDB.useEmulator({ emulatorHost: "http://localhost:9000" });

    it("reads data with GET and parses the response", async () => {
        const mock = createMockedFetch(200, { name: "Alice" });

        const snapshot = await db.ref("users/alice").get();

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/users/alice.json",
            expect.objectContaining({ method: "GET" }),
        );
        expect(snapshot.exists).toBe(true);
        expect(snapshot.val()).toEqual({ name: "Alice" });
    });

    it("returns an empty snapshot when the response is null", async () => {
        createMockedFetch(200, null);

        const snapshot = await db.ref("users/alice").get();

        expect(snapshot.exists).toBe(false);
        expect(snapshot.val()).toBeNull();
    });

    it("writes data with PUT", async () => {
        const mock = createMockedFetch(200, {});

        await db.ref("users/alice").set({ name: "Alice" });

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/users/alice.json",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ name: "Alice" }),
            }),
        );
    });

    it("serializes undefined as null when writing", async () => {
        const mock = createMockedFetch(200, {});

        await db.ref("users/alice").set(undefined);

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/users/alice.json",
            expect.objectContaining({ method: "PUT", body: "null" }),
        );
    });

    it("updates data with PATCH", async () => {
        const mock = createMockedFetch(200, {});

        await db.ref("users/alice").update({ age: 31 });

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/users/alice.json",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ age: 31 }),
            }),
        );
    });

    it("removes data with DELETE", async () => {
        const mock = createMockedFetch(200, null);

        await db.ref("users/alice").remove();

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/users/alice.json",
            expect.objectContaining({ method: "DELETE" }),
        );
    });

    it("pushes a new child and returns its reference", async () => {
        const mock = createMockedFetch(200, { name: "-Nabc123" });

        const child = await db.ref("items").push({ title: "widget" });

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/items.json",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ title: "widget" }),
            }),
        );
        expect(child.path).toBe("/items/-Nabc123");
    });

    it("pushes without a body when no value is provided", async () => {
        const mock = createMockedFetch(200, { name: "-Nabc123" });

        await db.ref("items").push();

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/items.json",
            expect.objectContaining({ method: "POST", body: undefined }),
        );
    });

    it("throws when the push response has no name", async () => {
        createMockedFetch(200, {});

        await expect(db.ref("items").push({ title: "x" })).rejects.toThrow(
            "Failed to generate push ID for Realtime Database",
        );
    });

    it("throws the server error message on failure", async () => {
        createMockedFetch(403, { error: "Permission denied" });

        await expect(db.ref("secret").get()).rejects.toThrow(
            "Permission denied",
        );
    });

    it("falls back to the raw response body when not JSON", async () => {
        const mock = vi.fn(async () => ({
            ok: false,
            status: 500,
            text: async () => "Internal Server Error",
        }));
        vi.stubGlobal("fetch", mock);

        await expect(db.ref("users").get()).rejects.toThrow(
            "Internal Server Error",
        );
    });
});
// ============================================================================
// Query Tests
// ============================================================================

describe("RTDBQuery", () => {
    const db = RTDB.useEmulator({ emulatorHost: "http://localhost:9000" });

    it("builds an orderByChild query URL", async () => {
        const mock = createMockedFetch(200, { a: { price: 1 } });

        await db.ref("products").orderByChild("price").get();

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/products.json?orderBy=%22price%22",
            expect.anything(),
        );
    });

    it("appends filters and limits to the query URL", async () => {
        const mock = createMockedFetch(200, { a: { price: 1 } });

        await db
            .ref("products")
            .orderByChild("price")
            .startAt(1)
            .endAt(10)
            .limitToFirst(5)
            .get();

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/products.json" +
                "?orderBy=%22price%22&startAt=1&endAt=10&limitToFirst=5",
            expect.anything(),
        );
    });

    it("encodes string filters as double-quoted values", async () => {
        const mock = createMockedFetch(200, { a: { name: "hot" } });

        await db.ref("products").orderByChild("name").equalTo("hot").get();

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/products.json?orderBy=%22name%22&equalTo=%22hot%22",
            expect.anything(),
        );
    });

    it("supports orderByKey with the $key sentinel", async () => {
        const mock = createMockedFetch(200, { a: 1 });

        await db.ref("products").orderByKey().limitToLast(3).get();

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/products.json?orderBy=%22%24key%22&limitToLast=3",
            expect.anything(),
        );
    });

    it("skips filters with undefined values", async () => {
        const mock = createMockedFetch(200, { a: 1 });

        await db.ref("products").orderByKey().equalTo(undefined).get();

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/products.json?orderBy=%22%24key%22",
            expect.anything(),
        );
    });

    it("combines the namespace with query parameters", async () => {
        const nsDb = RTDB.useEmulator({
            emulatorHost: "http://localhost:9000",
            namespace: "demo-no-project",
        });
        const mock = createMockedFetch(200, { a: 1 });

        await nsDb.ref("products").orderByValue().get();

        expect(mock).toHaveBeenCalledWith(
            "http://localhost:9000/products.json?ns=demo-no-project&orderBy=%22%24value%22",
            expect.anything(),
        );
    });

    it("returns a snapshot bound to the base path", async () => {
        createMockedFetch(200, { a: { price: 1 }, b: { price: 2 } });

        const snapshot = await db.ref("products").orderByChild("price").get();

        expect(snapshot.val()).toEqual({ a: { price: 1 }, b: { price: 2 } });
        expect(snapshot.ref.path).toBe("/products");
        expect(snapshot.numChildren()).toBe(2);
    });

    it("orders by priority as a value order", () => {
        const ref = db.ref("products");
        expect(ref.orderByPriority()).toBeInstanceOf(RTDBQuery);
        expect(ref.orderByValue()).toBeInstanceOf(RTDBQuery);
    });
});
