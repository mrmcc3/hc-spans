import "https://deno.land/std@0.168.0/dotenv/load.ts";
import * as spans from "./mod.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const root = spans.create({
	skip: false, // set to true to turn instrumentation off
	name: "root",
	service: "spans-example",
	extra: {
		"service.namespace": "spans",
	},
});

await sleep(10);

const c1 = spans.create({ name: "a child span", parent: root });
await sleep(10);
spans.end(c1, { "app.msg": "finished child example" });

const c2 = spans.create({ name: "a second child span", parent: root });
await sleep(10);
spans.link(c2, c1);
spans.end(c2, { "app.msg": "linked" });

await sleep(20);
spans.event({ name: "event!", parent: root, extra: { "app.note": "something happened!" } });
await sleep(30);

spans.end(root, { "app.msg": "all done sending to honeycomb" });

if (root) {
	const req = spans.honeycombRequest({
		apiKey: Deno.env.get("HC_API_KEY") ?? "",
		span: root,
	});
	const res = await fetch(req);
	console.log(res.status);
}
