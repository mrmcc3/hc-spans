import "https://deno.land/std@0.168.0/dotenv/load.ts";
import * as hc from "./mod.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const root = hc.create({
	skip: false, // set to true to turn instrumentation off
	name: "root",
	service: "spans-example",
	extra: {
		"service.namespace": "spans",
	},
});

await sleep(10);

const c1 = hc.create({ name: "a child span", parent: root });
await sleep(10);
hc.end(c1, { "app.msg": "finished child example" });

const c2 = hc.create({ name: "a second child span", parent: root });
await sleep(10);
hc.link(c2, c1);
hc.end(c2, { "app.msg": "linked" });

await sleep(20);
hc.event({ name: "event!", parent: root, extra: { "app.note": "something happened!" } });
await sleep(30);

hc.end(root, { "app.msg": "all done sending to honeycomb" });

const res = await hc.sendToHoneycomb({
	apiKey: Deno.env.get("HC_API_KEY") ?? "",
	span: root,
});

if (res) console.log(res.status);
