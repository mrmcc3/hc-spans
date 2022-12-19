import { load } from "https://deno.land/std@0.168.0/dotenv/mod.ts";
import * as spans from "./mod.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const root = spans.create({
	skip: false, // set to true to turn instrumentation off
	name: "root",
	service: "spans-example",
});

await sleep(10);

// load env
const ls = spans.create({ name: "load", parent: root });
console.log("loading env vars!");
await load();
spans.end(ls, { msg: "loaded environment variables" });

await sleep(20);
console.log("simulating an event!");
spans.event({ name: "event!", parent: root, extra: { note: "something happened!" } });
await sleep(30);

spans.end(root, { msg: "all done sending to honeycomb" });

if (root) {
	// collect
	const req = spans.honeycombRequest({
		dataset: Deno.env.get("HC_DATASET") ?? "",
		apiKey: Deno.env.get("HC_API_KEY") ?? "",
		span: root,
	});

	const res = await fetch(req);
	console.log(res.status, await res.text());
}
