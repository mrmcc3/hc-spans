import {
	assert,
	assertEquals,
	assertNotEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { z } from "https://deno.land/x/zod@v3.20.2/mod.ts";
import * as span from "./mod.ts";

const assertUUID = z.string().uuid().parse;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test({
	name: "create",
	fn() {
		const s = span.create({ service: "spans", name: "span.create" });
		assert(s);
		assertEquals(s.service, "spans");
		assertEquals(s.name, "span.create");
		assertEquals(s.extra, undefined);
		assertNotEquals(s.spanId, s.traceId);
		assertUUID(s.spanId);
		assertUUID(s.traceId);
		z.number().positive().int().parse(s.startTime);
		assert(s.startTime <= Date.now());
		assertEquals(s.duration, undefined);
		assertEquals(s.spans, [s]);
	},
});

Deno.test({
	name: "create skip",
	fn() {
		const s = span.create({ skip: true, service: "spans", name: "span.create" });
		assertEquals(s, null);
	},
});

Deno.test({
	name: "create from parent request",
	fn() {
		const extra = { a: 1, b: "2", c: null, d: undefined, e: true };
		const headers = new Headers();
		headers.set("x-trace-id", crypto.randomUUID());
		headers.set("x-parent-id", crypto.randomUUID());
		const s = span.create({
			service: "spans",
			name: "span.create",
			parent: new Request("http://localhost:3000", { headers }),
			extra,
		});
		assert(s);
		assertEquals(s.service, "spans");
		assertEquals(s.name, "span.create");
		assertEquals(s.extra, extra);
		assertNotEquals(s.spanId, s.traceId);
		assertEquals(s.traceId, headers.get("x-trace-id"));
		assertEquals(s.parentId, headers.get("x-parent-id"));
		z.number().positive().int().parse(s.startTime);
		assert(s.startTime <= Date.now());
		assertEquals(s.duration, undefined);
		assertEquals(s.spans, [s]);
	},
});

Deno.test({
	name: "create from parent span",
	fn() {
		const p = span.create({ service: "spans", name: "span.parent" });
		assert(p);
		const extra = { a: 1, b: "2", c: null, d: undefined, e: true };
		const c = span.create({ parent: p, name: "child", extra });
		assert(c);
		assertEquals(c.spans, [p, c]);
	},
});

Deno.test({
	name: "end with extra data",
	async fn() {
		const s = span.create({ service: "spans", name: "span.end" });
		assert(s);
		await sleep(1);
		const extra = { a: 1, b: null };
		span.end(s, extra);
		z.number().positive().parse(s.duration);
		assertEquals(s.extra, extra);
	},
});

Deno.test({
	name: "extra",
	fn() {
		const extra = { a: 1, b: null };
		const s1 = span.create({ service: "spans", name: "s1", extra });
		assert(s1);
		const s2 = span.create({ service: "spans", name: "s2" });
		assert(s2);
		span.extra(s2, extra);
		assertEquals(s1.extra, s2.extra);
	},
});

Deno.test({
	name: "propagate trace to headers",
	fn() {
		const s1 = span.create({ service: "spans", name: "s1" });
		assert(s1);
		const headers = new Headers();
		span.propagate(s1, headers);
		const s2 = span.create({
			parent: new Request("http://localhost:3000", { headers }),
			service: "spans",
			name: "s2",
		});
		assert(s2);
		assertEquals(s2.traceId, s1.traceId);
		assertEquals(s2.parentId, s1.spanId);
		assertEquals(s1.parentId, undefined);
		assertEquals(s1.spans, [s1]);
		assertEquals(s2.spans, [s2]);
	},
});

Deno.test({
	name: "span event",
	fn() {
		const extra = { a: 1 };
		const s1 = span.create({ service: "spans", name: "s1" });
		assert(s1);
		span.event({ name: "e1", parent: null, extra });
		assertEquals(s1.spans, [s1]);
		span.event({ name: "e2", parent: s1, extra });
		const s2 = s1.spans.at(-1);
		assert(s2);
		assertEquals(s2.spans.length, 2);
		assertEquals(s2.name, "e2");
		assertEquals(s2.parentId, s1.spanId);
		assertEquals(s2.traceId, s1.traceId);
		assertEquals(s2.service, s1.service);
		assertEquals(s2.extra, { annotationType: "span_event", a: 1 });
	},
});

Deno.test({
	name: "links",
	fn() {
		const s1 = span.create({ service: "spans", name: "s1" });
		assert(s1);
		const s2 = span.create({ service: "spans", name: "s2" });
		assert(s2);
		span.link(s1, s2);
		const link = s1.spans.at(-1);
		assert(link);
		assertEquals(s1.spans.length, 2);
		assertEquals(link.name, "link");
		assertEquals(link.parentId, s1.spanId);
		assertEquals(link.traceId, s1.traceId);
		assertEquals(link.extra, {
			annotationType: "link",
			linkSpanId: s2.spanId,
			linkTraceId: s2.traceId,
		});
	},
});

Deno.test({
	name: "null",
	fn() {
		const extra = { e: 1 };
		const s1 = span.create({ service: "spans", name: "s1", skip: true });
		span.event({ name: "skip", parent: s1, extra });
		span.link(s1, s1);
		span.extra(s1, { e: 2 });
		span.end(s1, { e: 3 });
		assertEquals(s1, null);
	},
});

Deno.test({
	name: "honeycomb batch",
	async fn() {
		const s1 = span.create({ service: "spans", name: "s1" });
		assert(s1);
		span.event({ name: "e1", parent: s1, extra: { e: 1 } });
		await sleep(1);
		span.end(s1, { s: 1 });
		const req = span.honeycombRequest({ dataset: "ds", apiKey: "key", span: s1 });
		assertEquals(req.url, "https://api.honeycomb.io/1/batch/ds");
		assertEquals(req.headers.get("content-type"), "application/json");
		assertEquals(req.headers.get("x-honeycomb-team"), "key");
		assertEquals(req.bodyUsed, false);
		const data = await req.json();
		z.tuple([
			z.object({
				time: z.string().datetime(),
				data: z.object({
					name: z.literal("s1"),
					service: z.literal("spans"),
					startTime: z.number().positive().int(),
					duration: z.number().positive().int(),
					spanId: z.string().uuid(),
					parentId: z.undefined(),
					traceId: z.string().uuid(),
					extra: z.object({ s: z.literal(1) }),
				}),
			}),
			z.object({
				time: z.string().datetime(),
				data: z.object({
					name: z.literal("e1"),
					service: z.literal("spans"),
					startTime: z.number().positive().int(),
					duration: z.undefined(),
					spanId: z.string().uuid(),
					parentId: z.literal(s1.spanId),
					traceId: z.literal(s1.traceId),
					extra: z.object({ e: z.literal(1), annotationType: z.literal("span_event") }),
				}),
			}),
		]).parse(data);
	},
});
