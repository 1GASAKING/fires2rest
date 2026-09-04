import { importPKCS8, SignJWT, type JWTPayload } from "jose";
import type { Auth } from "./types.js";

export interface ServiceAccountAuthConfig {
    /** The service account private key (PEM format) */
    privateKey: string;
    /** The service account email */
    clientEmail: string;
    /** Optional. OAuth 2.0 scopes to request. Defaults to Firestore datastore scope. */
    scopes?: string[];
}

export async function createJWT(
    config: ServiceAccountAuthConfig,
    scopes: string[] = [
        "https://www.googleapis.com/auth/datastore",
    ],
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
        iss: config.clientEmail,
        sub: config.clientEmail,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
        scope: scopes.join(" "),
    };

    const privateKey = await importPKCS8(config.privateKey, "RS256");
    const token = await new SignJWT(payload)
        .setProtectedHeader({
            alg: "RS256",
            typ: "JWT",
        })
        .sign(privateKey);
    return token;
}

export async function getFirestoreToken(
    config: ServiceAccountAuthConfig,
    scopes?: string[],
): Promise<string> {
    return getOAuthToken(config, scopes);
}

export async function getOAuthToken(
    config: ServiceAccountAuthConfig,
    scopes?: string[],
): Promise<string> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: await createJWT(config, scopes),
        }),
    });

    const data = (await response.json()) as { access_token: unknown };
    if (typeof data.access_token !== "string") {
        throw new Error("Invalid access token");
    }
    return data.access_token;
}

export class ServiceAccountAuth implements Auth {
    private _token: string | null = null;
    private _tokenExpiry: number = 0;
    private readonly _scopes?: string[];

    constructor(
        private readonly _config: ServiceAccountAuthConfig & {
            scopes?: string[];
        },
    ) {
        this._scopes = _config.scopes;
    }

    async getToken(): Promise<string> {
        if (this._token && Date.now() < this._tokenExpiry - 60000) {
            return this._token;
        }
        this._token = await getOAuthToken(this._config, this._scopes);
        this._tokenExpiry = Date.now() + 3600 * 1000; // 1 hour
        return this._token;
    }
}

export class NoAuth implements Auth {
    constructor(private readonly token: string = "") {}

    async getToken(): Promise<string> {
        return this.token;
    }
}
