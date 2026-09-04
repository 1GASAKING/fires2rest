const base = "http://127.0.0.1:9000";
const ns = "?ns=demo-no-project";
const headers = {
    "Authorization": "Bearer owner",
    "Content-Type": "application/json",
};

const enc = (s) => encodeURIComponent(JSON.stringify(s));

const body = {
    users: {
        alice: { age: 30 },
        bob: { age: 25 },
        carol: { age: 35 },
    },
};

async function main() {
    let r = await fetch(`${base}/.json${ns}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
    });
    console.log("PUT root:", r.status, await r.text());

    r = await fetch(`${base}/users.json${ns}`);
    console.log("GET users:", r.status, await r.text());

    r = await fetch(`${base}/users.json${ns}&orderBy=${enc("age")}`);
    console.log("QUERY orderBy age:", r.status, await r.text());

    r = await fetch(
        `${base}/users.json${ns}&orderBy=${enc("age")}&startAt=30&limitToFirst=2`,
    );
    console.log("QUERY age>=30 top2:", r.status, await r.text());

    r = await fetch(
        `${base}/users.json${ns}&orderBy=${enc("age")}&equalTo=35`,
    );
    console.log("QUERY age==35:", r.status, await r.text());
}

main().catch((e) => console.error("ERR", e.message));
