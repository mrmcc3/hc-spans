import {
	assert,
	assertEquals,
	assertNotEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { z } from "https://deno.land/x/zod@v3.20.2/mod.ts";
import * as span from "./mod.ts";

// helpers

const assertUUID = z.string().uuid().parse;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

//

Deno.test({
	name: "create",
	fn() {
		const s = span.create({
			service: "spans",
			name: "span.create",
		});
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
		assertEquals(s.getTrace(), [s]);
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
		assertEquals(s.getTrace(), [s]);
	},
});

Deno.test({
	name: "end then restart",
	async fn() {
		const s = span.create({
			service: "spans",
			name: "span.create",
		});
		assert(s);
		const st = s.startTime;
		z.number().positive().parse(st);
		await sleep(1);
		span.end(s);
		z.number().positive().parse(s.duration);
		span.restart(s);
		assertEquals(s.duration, undefined);
		assert(s.startTime > st);
	},
});
