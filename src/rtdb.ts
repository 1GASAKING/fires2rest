/**
 * Realtime Database REST API Client
 *
 * A lightweight client that talks directly to the Firebase
 * Realtime Database REST endpoint using plain HTTP.
 *
 * @see https://firebase.google.com/docs/reference/rest/database
 */

import { NoAuth, ServiceAccountAuth } from "./auth.js";
import type { ServiceAccountAuthConfig } from "./auth.js";
import type { Auth } from "./types.js";

// ============================================================================
// Utility Helpers
// ============================================================================

function encodeValueForQuery(value: unknown): string {
    if (typeof value === "string") {
        // REST requires string values to be double-quoted.
        return JSON.stringify(value);
    }
    if (typeof value === "boolean" || typeof value === "number") {
        return String(value);
    }
    if (value === null) {
        return "null";
    }
    return JSON.stringify(value);
}

function normalizePath(path: string): string {
    return `/${path.replace(/^\/+|\/+$/g, "")}`;
}

// ============================================================================
// Data Snapshot
// ============================================================================

/**
 * A snapshot of Realtime Database data.
 */
export class RTDBDataSnapshot {
    private readonly _value: unknown;
    private readonly _ref: RTDBReference;

    constructor(value: unknown, ref: RTDBReference) {
        this._value = value;
        this._ref = ref;
    }

    /** The key of the location this snapshot came from (null at root). */
    get key(): string | null {
        return this._ref.key;
    }

    /** The reference for the location this snapshot came from. */
    get ref(): RTDBReference {
        return this._ref;
    }

    /** True if this snapshot contains any data. */
    get exists(): boolean {
        return this._value !== null && this._value !== undefined;
    }

    /** Returns the data contained in this snapshot, or null if missing. */
    val(): unknown {
        return this._value ?? null;
    }

    /** Returns a snapshot for the child at the given relative path. */
    child(path: string): RTDBDataSnapshot {
        const childRef = this._ref.child(path);
        const value =
            typeof this._value === "object" && this._value !== null
                ? (this._value as Record<string, unknown>)[childRef.key ?? ""]
                : undefined;
        if (value === undefined) {
            return new RTDBDataSnapshot(null, childRef);
        }
        return new RTDBDataSnapshot(value, childRef);
    }

    /** Returns true if the specified child path exists. */
    hasChild(path: string): boolean {
        return this.child(path).exists;
    }

    /** Returns true if this snapshot contains any child data. */
    hasChildren(): boolean {
        return this.numChildren() > 0;
    }

    /** Returns the number of children. */
    numChildren(): number {
        if (typeof this._value !== "object" || this._value === null) {
            return 0;
        }
        return Object.keys(this._value).length;
    }

    /** Iterates over each child snapshot. */
    forEach(callback: (child: RTDBDataSnapshot) => void): void {
        if (typeof this._value !== "object" || this._value === null) {
            return;
        }
        for (const [key, value] of Object.entries(
            this._value as Record<string, unknown>,
        )) {
            const childRef = this._ref.child(key);
            callback(new RTDBDataSnapshot(value, childRef));
        }
    }

    /** Returns the keys of all children. */
    get keys(): string[] {
        if (typeof this._value !== "object" || this._value === null) {
            return [];
        }
        return Object.keys(this._value);
    }
}

// ============================================================================
// Query Types
// ============================================================================

type OrderByVariant =
    | { type: "child"; key: string }
    | { type: "key" }
    | { type: "value" };

interface QueryFilter {
    method: "equalTo" | "startAt" | "endAt" | "limitToFirst" | "limitToLast";
    value?: unknown;
}

// ============================================================================
// Query
// ============================================================================

/**
 * A read-only query over a Realtime Database node.
 */
export class RTDBQuery {
    /** @internal */
    protected readonly _rtdb: RTDB;
    /** @internal */
    protected readonly _basePath: string;
    /** @internal */
    protected readonly _orderBy: OrderByVariant;
    /** @internal */
    protected readonly _filters: QueryFilter[];

    constructor(
        rtdb: RTDB,
        basePath: string,
        orderBy: OrderByVariant,
        filters: QueryFilter[] = [],
    ) {
        this._rtdb = rtdb;
        this._basePath = basePath;
        this._orderBy = orderBy;
        this._filters = filters;
    }

    equalTo(value: unknown): RTDBQuery {
        return new RTDBQuery(this._rtdb, this._basePath, this._orderBy, [
            ...this._filters,
            { method: "equalTo", value },
        ]);
    }

    startAt(value: unknown): RTDBQuery {
        return new RTDBQuery(this._rtdb, this._basePath, this._orderBy, [
            ...this._filters,
            { method: "startAt", value },
        ]);
    }

    endAt(value: unknown): RTDBQuery {
        return new RTDBQuery(this._rtdb, this._basePath, this._orderBy, [
            ...this._filters,
            { method: "endAt", value },
        ]);
    }

    limitToFirst(count: number): RTDBQuery {
        return new RTDBQuery(this._rtdb, this._basePath, this._orderBy, [
            ...this._filters,
            { method: "limitToFirst", value: count },
        ]);
    }

    limitToLast(count: number): RTDBQuery {
        return new RTDBQuery(this._rtdb, this._basePath, this._orderBy, [
            ...this._filters,
            { method: "limitToLast", value: count },
        ]);
    }

    /** Executes the query and returns the matching data. */
    async get(): Promise<RTDBDataSnapshot> {
        const url = this._buildUrl();
        const response = await this._rtdb._request(url, { method: "GET" });
        const ref = new RTDBReference(this._rtdb, this._basePath);
        return new RTDBDataSnapshot(response ?? null, ref);
    }

    /** @internal */
    private _buildUrl(): string {
        let base = this._rtdb._buildRESTUrl(this._basePath);
        const params: string[] = [];

        switch (this._orderBy.type) {
            case "child":
                params.push(`orderBy=${encodeURIComponent(JSON.stringify(this._orderBy.key))}`);
                break;
            case "key":
                params.push(`orderBy=${encodeURIComponent(JSON.stringify("$key"))}`);
                break;
            case "value":
                params.push(`orderBy=${encodeURIComponent(JSON.stringify("$value"))}`);
                break;
        }

        for (const filter of this._filters) {
            if (filter.value === undefined) {
                continue;
            }
            params.push(
                `${filter.method}=${encodeURIComponent(encodeValueForQuery(filter.value))}`,
            );
        }

        const separator = base.includes("?") ? "&" : "?";
        return params.length > 0 ? `${base}${separator}${params.join("&")}` : base;
    }
}

// ============================================================================
// Reference
// ============================================================================

/**
 * A reference to a location in the Realtime Database.
 */
export class RTDBReference {
    /** @internal */
    private readonly _rtdb: RTDB;
    readonly path: string;

    constructor(rtdb: RTDB, path: string) {
        this._rtdb = rtdb;
        this.path = path === "/" ? "/" : normalizePath(path);
    }

    /** The final segment of this path (null for the root). */
    get key(): string | null {
        const trimmed = this.path.replace(/^\/+|\/+$/g, "");
        if (!trimmed) return null;
        return trimmed.split("/").pop() ?? null;
    }

    /** The parent reference, or null at the root. */
    get parent(): RTDBReference | null {
        const trimmed = this.path.replace(/^\/+|\/+$/g, "");
        if (!trimmed) return null;
        const parts = trimmed.split("/");
        parts.pop();
        return new RTDBReference(this._rtdb, parts.join("/"));
    }

    /** The root reference. */
    get root(): RTDBReference {
        return new RTDBReference(this._rtdb, "/");
    }

    /** Returns a reference to the given relative child path. */
    child(path: string): RTDBReference {
        const trimmed = this.path.replace(/^\/+|\/+$/g, "");
        const childTrimmed = path.replace(/^\/+|\/+$/g, "");
        const combined = trimmed
            ? childTrimmed
                ? `${trimmed}/${childTrimmed}`
                : trimmed
            : childTrimmed;
        return new RTDBReference(this._rtdb, combined);
    }

    // ----------------------------------------------------------------------
    // Reads
    // ----------------------------------------------------------------------

    /** Reads the data at this location. */
    async get(): Promise<RTDBDataSnapshot> {
        const response = await this._rtdb._request(
            this._rtdb._buildRESTUrl(this.path),
            { method: "GET" },
        );
        return new RTDBDataSnapshot(response ?? null, this);
    }

    // ----------------------------------------------------------------------
    // Writes
    // ----------------------------------------------------------------------

    /** Overwrites the data at this location. */
    async set(value: unknown): Promise<void> {
        await this._rtdb._request(this._rtdb._buildRESTUrl(this.path), {
            method: "PUT",
            body: JSON.stringify(value === undefined ? null : value),
        });
    }

    /** Atomically updates only the specified child paths (null removes). */
    async update(values: Record<string, unknown>): Promise<void> {
        await this._rtdb._request(this._rtdb._buildRESTUrl(this.path), {
            method: "PATCH",
            body: JSON.stringify(values),
        });
    }

    /** Removes the data at this location. */
    async remove(): Promise<void> {
        await this._rtdb._request(this._rtdb._buildRESTUrl(this.path), {
            method: "DELETE",
        });
    }

    /**
     * Appends a child under this location using a unique push ID.
     * Returns a reference to the new child.
     */
    async push(value?: unknown): Promise<RTDBReference> {
        const response = await this._rtdb._request(
            this._rtdb._buildRESTUrl(this.path),
            {
                method: "POST",
                body:
                    value === undefined
                        ? undefined
                        : JSON.stringify(value),
            },
        );
        const result = (response ?? {}) as { name?: string };
        if (!result.name) {
            throw new Error(
                "Failed to generate push ID for Realtime Database",
            );
        }
        return this.child(result.name);
    }

    // ----------------------------------------------------------------------
    // Queries
    // ----------------------------------------------------------------------

    orderByChild(path: string): RTDBQuery {
        return new RTDBQuery(this._rtdb, this.path, {
            type: "child",
            key: path,
        });
    }

    orderByKey(): RTDBQuery {
        return new RTDBQuery(this._rtdb, this.path, { type: "key" });
    }

    orderByValue(): RTDBQuery {
        return new RTDBQuery(this._rtdb, this.path, { type: "value" });
    }

    orderByPriority(): RTDBQuery {
        return this.orderByValue();
    }
}

// ============================================================================
// Main Client
// ============================================================================

export interface RTDBEmulatorOptions {
    /** Defaults to 127.0.0.1:9000. */
    emulatorHost?: string;
    /** Optional namespace passed as the `ns` query parameter. */
    namespace?: string;
}

export interface RTDBServiceAccountOptions extends ServiceAccountAuthConfig {
    /** Optional database URL override. */
    databaseURL?: string;
}

/**
 * A client for the Firebase Realtime Database REST API.
 */
export class RTDB {
    private readonly _auth: Auth;
    private readonly _baseURL: string;
    private readonly _namespace?: string;

    private constructor(baseURL: string, auth: Auth, namespace?: string) {
        this._baseURL = baseURL.replace(/\/+$/, "");
        this._auth = auth;
        this._namespace = namespace;
    }

    /** Connect to the Realtime Database emulator. */
    static useEmulator({
        emulatorHost = "127.0.0.1:9000",
        namespace,
    }: RTDBEmulatorOptions = {}): RTDB {
        const baseURL = emulatorHost.startsWith("http")
            ? emulatorHost
            : `http://${emulatorHost}`;
        return new RTDB(baseURL, new NoAuth(), namespace);
    }

    /**
     * Connect to a live Realtime Database using service account credentials.
     */
    static useServiceAccount(
        projectIdOrURL: string,
        config: RTDBServiceAccountOptions,
    ): RTDB {
        const databaseURL = config.databaseURL
            ? config.databaseURL
            : projectIdOrURL.startsWith("http")
              ? projectIdOrURL
              : `https://${projectIdOrURL}-default-rtdb.firebaseio.com`;

        const auth = new ServiceAccountAuth({
            ...config,
            scopes: config.scopes ?? [
                "https://www.googleapis.com/auth/firebase.database",
                "https://www.googleapis.com/auth/userinfo.email",
            ],
        });

        return new RTDB(databaseURL, auth);
    }

    /** Creates a reference to the given path. */
    ref(path: string = "/"): RTDBReference {
        return new RTDBReference(this, path);
    }

    /** Alias of ref() for API familiarity with Firestore's doc(). */
    doc(path: string = "/"): RTDBReference {
        return this.ref(path);
    }

    /** The root reference. */
    get root(): RTDBReference {
        return this.ref("/");
    }

    // ----------------------------------------------------------------------
    // Internal API
    // ----------------------------------------------------------------------

    /** @internal */
    _buildRESTUrl(path: string): string {
        const cleaned = normalizePath(path).replace(/^\/+/, "");
        const suffix = this._namespace
            ? `?ns=${encodeURIComponent(this._namespace)}`
            : "";
        if (!cleaned) {
            return `${this._baseURL}/.json${suffix}`;
        }
        return `${this._baseURL}/${cleaned}.json${suffix}`;
    }

    /** @internal */
    async _request(
        url: string,
        init: { method: string; body?: string },
    ): Promise<unknown> {
        const headers: Record<string, string> = {};
        const token = await this._auth.getToken();
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        if (init.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(url, {
            method: init.method,
            headers,
            body: init.body,
        });

        const text = await response.text();

        if (!response.ok) {
            let message = `Realtime Database request failed (${response.status})`;
            if (text) {
                try {
                    const parsed = JSON.parse(text) as { error?: string };
                    if (parsed.error) {
                        message = parsed.error;
                    }
                } catch {
                    message = text;
                }
            }
            throw new Error(message);
        }

        if (!text || text === "null") {
            return null;
        }

        try {
            return JSON.parse(text) as unknown;
        } catch {
            return text;
        }
    }
}
