import {
	assert,
	assertEquals,
	assertNotEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { z } from "https://deno.land/x/zod@v3.20.2/mod.ts";
import * as hc from "./mod.ts";

const assertUUID = z.string().uuid().parse;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test({
	name: "create",
	fn() {
		const s = hc.create({ service: "spans", name: "span.create" });
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
		const s = hc.create({ skip: true, service: "spans", name: "span.create" });
		assertEquals(s.spans, []);
		assertEquals(s.spanId, "skipped");
	},
});

Deno.test({
	name: "create from parent request",
	fn() {
		const extra = { a: 1, b: "2", c: null, d: undefined, e: true };
		const headers = new Headers();
		headers.set("x-trace-id", crypto.randomUUID());
		headers.set("x-parent-id", crypto.randomUUID());
		const s = hc.create({
			service: "spans",
			name: "span.create",
			parent: new Request("http://localhost:3000", { headers }),
			extra,
		});
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
		const p = hc.create({ service: "spans", name: "span.parent" });
		const extra = { a: 1, b: "2", c: null, d: undefined, e: true };
		const c = hc.create({ parent: p, name: "child", extra });
		assertEquals(c.spans, [p, c]);
	},
});

Deno.test({
	name: "end with extra data",
	async fn() {
		const s = hc.create({ service: "spans", name: "span.end" });
		await sleep(1);
		const extra = { a: 1, b: null };
		hc.end(s, extra);
		z.number().positive().parse(s.duration);
		assertEquals(s.extra, extra);
	},
});

Deno.test({
	name: "extra",
	fn() {
		const extra = { a: 1, b: null };
		const s1 = hc.create({ service: "spans", name: "s1", extra });
		const s2 = hc.create({ service: "spans", name: "s2" });
		hc.extra(s2, extra);
		assertEquals(s1.extra, s2.extra);
	},
});

Deno.test({
	name: "propagate trace to headers",
	fn() {
		const s1 = hc.create({ service: "spans", name: "s1" });
		const headers = new Headers();
		hc.propagate(s1, headers);
		const s2 = hc.create({
			parent: new Request("http://localhost:3000", { headers }),
			service: "spans",
			name: "s2",
		});
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
		const s1 = hc.create({ service: "spans", name: "s1" });
		assertEquals(s1.spans, [s1]);
		hc.event({ name: "e2", parent: s1, extra });
		const s2 = s1.spans.at(-1);
		assert(s2);
		assertEquals(s2.spans.length, 2);
		assertEquals(s2.name, "e2");
		assertEquals(s2.parentId, s1.spanId);
		assertEquals(s2.traceId, s1.traceId);
		assertEquals(s2.service, s1.service);
		assertEquals(s2.extra, { "meta.annotation_type": "span_event", a: 1 });
	},
});

Deno.test({
	name: "links",
	fn() {
		const s1 = hc.create({ service: "spans", name: "s1" });
		const s2 = hc.create({ service: "spans", name: "s2" });
		hc.link(s1, s2);
		const link = s1.spans.at(-1);
		assert(link);
		assertEquals(s1.spans.length, 2);
		assertEquals(link.name, "link");
		assertEquals(link.parentId, s1.spanId);
		assertEquals(link.traceId, s1.traceId);
		assertEquals(link.extra, {
			"meta.annotation_type": "link",
			"trace.link.span_id": s2.spanId,
			"trace.link.trace_id": s2.traceId,
		});
	},
});

Deno.test({
	name: "skip all",
	fn() {
		const extra = { e: 1 };
		const s1 = hc.create({ service: "spans", name: "s1", skip: true });
		hc.event({ name: "skip", parent: s1, extra });
		const s2 = hc.create({ name: "child", parent: s1 });
		hc.link(s2, s1);
		hc.end(s2);
		hc.extra(s1, { e: 2 });
		hc.end(s1, { e: 3 });
		assertEquals(s1.spans, []);
		assertEquals(s1.spanId, "skipped");
		assertEquals(s2.spans, []);
		assertEquals(s1.spanId, "skipped");
	},
});

Deno.test({
	name: "honeycomb batch",
	async fn() {
		const s1 = hc.create({ service: "spans", name: "s1" });
		assert(s1);
		hc.event({ name: "e1", parent: s1, extra: { e: 1 } });
		await sleep(1);
		hc.end(s1, { s: 1 });
		const req = hc.honeycombRequest({ apiKey: "key", span: s1 });
		assertEquals(
			req.url,
			new URL(
				`https://api.honeycomb.io/1/batch/${s1.service}`,
			).toString(),
		);
		assertEquals(req.headers.get("content-type"), "application/json");
		assertEquals(req.headers.get("x-honeycomb-team"), "key");
		assertEquals(req.bodyUsed, false);
		const data = await req.json();
		z.tuple([
			z.object({
				time: z.string().datetime(),
				data: z.object({
					name: z.literal("s1"),
					"service.name": z.literal("spans"),
					duration_ms: z.number().positive().int(),
					"trace.span_id": z.string().uuid(),
					"trace.parent_id": z.undefined(),
					"trace.trace_id": z.string().uuid(),
					s: z.literal(1),
				}),
			}),
			z.object({
				time: z.string().datetime(),
				data: z.object({
					name: z.literal("e1"),
					"service.name": z.literal("spans"),
					duration_ms: z.undefined(),
					"trace.span_id": z.string().uuid(),
					"trace.parent_id": z.literal(s1.spanId),
					"trace.trace_id": z.literal(s1.traceId),
					e: z.literal(1),
					"meta.annotation_type": z.literal("span_event"),
				}),
			}),
		]).parse(data);
	},
});

function example(span: hc.Span) {
	return span.name;
}

Deno.test({
	name: "exported types",
	fn() {
		const s1 = hc.create({ service: "spans", name: "s1" });
		assertEquals(example(s1), s1.name);
	},
});
