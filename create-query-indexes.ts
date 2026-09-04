/**
 * One-off script: create the missing composite indexes for
 * tests/query.integration.test.ts in the live Firestore project.
 *
 * Run with: npx tsx create-query-indexes.ts
 */
import { config } from "dotenv";
import { createJWT } from "./src/auth.js";

config();

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;
const INDEXES_API = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/fires2rest-query-testing/indexes`;

const INDEXES = [
    {
        queryScope: "COLLECTION",
        fields: [
            { fieldPath: "active", order: "ASCENDING" },
            { fieldPath: "age", order: "ASCENDING" },
            { fieldPath: "__name__", order: "ASCENDING" },
        ],
    },
    {
        queryScope: "COLLECTION",
        fields: [
            { fieldPath: "active", order: "ASCENDING" },
            { fieldPath: "score", order: "DESCENDING" },
            { fieldPath: "__name__", order: "DESCENDING" },
        ],
    },
];

async function getToken() {
    const assertion = await createJWT({
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
        }),
    });
    const text = await res.text();
    let data: { access_token?: unknown };
    try {
        data = JSON.parse(text) as { access_token?: unknown };
    } catch {
        throw new Error(
            `OAuth token endpoint returned non-JSON (${res.status}): ${text.slice(0, 400)}`,
        );
    }
    if (typeof data.access_token !== "string") {
        throw new Error(`OAuth token endpoint returned: ${text.slice(0, 400)}`);
    }
    return data.access_token;
}

async function main() {
    const token = await getToken();
    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };

    const names: string[] = [];

    for (const index of INDEXES) {
        const res = await fetch(INDEXES_API, {
            method: "POST",
            headers,
            body: JSON.stringify(index),
        });
        const text = await res.text();
        let body: { name?: string; state?: string; error?: { message?: string } };
        try {
            body = JSON.parse(text) as typeof body;
        } catch {
            throw new Error(
                `Index endpoint returned non-JSON (${res.status}): ${text.slice(0, 400)}`,
            );
        }

        if (!res.ok) {
            if (res.status === 409) {
                console.log(
                    `Already exists: ${index.fields.map((f) => `${f.fieldPath} ${f.order}`).join(", ")}`,
                );
            } else {
                console.error(
                    `Failed to create ${index.fields.map((f) => `${f.fieldPath} ${f.order}`).join(", ")}:`,
                    body.error?.message ?? JSON.stringify(body),
                );
                throw new Error(`Index creation failed (${res.status})`);
            }
        } else {
            console.log(`Created index ${body.name} (state=${body.state})`);
            names.push(body.name!);
        }
    }

    // If nothing new was created, poll nothing; otherwise wait for READY.
    if (names.length === 0) {
        console.log("No new indexes were created — nothing to wait for.");
        return;
    }

    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        const list = (await (await fetch(INDEXES_API, { headers })).json()) as {
            indexes?: { name: string; state: string }[];
        };
        const all = (list.indexes ?? []).filter((idx) => names.includes(idx.name));
        const states = all.map((idx) => `${idx.name.split("/").pop()}:${idx.state}`);
        console.log(`Poll: ${states.join(" | ") || "not found yet"}`);
        if (all.length === names.length && all.every((idx) => idx.state === "READY")) {
            console.log(`All ${names.length} index(es) READY.`);
            return;
        }
        await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error("Timed out waiting for indexes to become READY.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});