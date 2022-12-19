type ExtraData = Record<string, null | boolean | string | number | undefined>;

interface CreateArgBase {
	name: string;
	extra?: ExtraData;
}

interface NoParent extends CreateArgBase {
	kind: "no-parent";
	service: string;
}

interface FromRequest extends CreateArgBase {
	kind: "request";
	parent: Request;
	service: string;
}

interface FromSpan extends CreateArgBase {
	kind: "span";
	parent: Span;
}

class Span {
	spans: Span[]; // all the spans
	service: string; // the service the span is from
	name: string; // role of the span
	startTime: number; // when the span starts
	duration?: number; // known when complete
	spanId: string; // uniquely identifies the span
	traceId: string; // identifies which trace the span belongs to
	parentId?: string; // the parent span that created this span
	extra?: ExtraData; // extra data that might be helpful.

	constructor(arg: NoParent | FromRequest | FromSpan) {
		this.name = arg.name;
		this.startTime = Date.now();
		this.spanId = crypto.randomUUID();
		this.extra = arg.extra;
		if (arg.kind === "span") {
			this.spans = arg.parent.spans;
			this.service = arg.parent.service;
			this.traceId = arg.parent.traceId;
			this.parentId = arg.parent.spanId;
		} else if (arg.kind === "request") {
			this.spans = [];
			this.service = arg.service;
			this.traceId = arg.parent.headers.get("x-trace-id") ?? crypto.randomUUID();
			this.parentId = arg.parent.headers.get("x-parent-id") ?? undefined;
		} else {
			this.spans = [];
			this.service = arg.service;
			this.traceId = crypto.randomUUID();
		}
		this.spans.push(this);
	}

	hcJSON() {
		return {
			time: new Date(this.startTime).toISOString(),
			data: {
				service: this.service,
				name: this.name,
				startTime: this.startTime,
				duration: this.duration,
				spanId: this.spanId,
				traceId: this.traceId,
				parentId: this.parentId,
				extra: this.extra,
			},
		};
	}
}

interface CreateArg extends CreateArgBase {
	skip?: boolean;
	service?: string;
	parent?: Request | Span;
}

export function create({ skip, name, service, parent, extra }: CreateArg): Span | null {
	if (skip) return null; // short circuit
	if (parent instanceof Span) {
		return new Span({ kind: "span", name, parent, extra });
	}
	if (!service) throw new Error("service must be provided when parent is not a span");
	if (parent instanceof Request) {
		return new Span({ kind: "request", name, service, parent, extra });
	}
	return new Span({ kind: "no-parent", name, service, extra });
}

interface EventArg extends CreateArgBase {
	parent: Span | null;
}

export function event({ name, parent, extra }: EventArg) {
	if (parent) {
		new Span({
			kind: "span",
			name,
			parent,
			extra: { ...extra, annotationType: "span_event" },
		});
	}
}

export function link(parent: Span | null, to: Span | null) {
	if (parent && to) {
		new Span({
			kind: "span",
			name: "link",
			parent,
			extra: {
				annotationType: "link",
				linkSpanId: to.spanId,
				linkTraceId: to.traceId,
			},
		});
	}
}

export function propagate(span: Span | null, headers: Headers) {
	if (!span) return;
	headers.set("x-trace-id", span.traceId);
	headers.set("x-parent-id", span.spanId);
}

export function extra(span: Span | null, extra: ExtraData) {
	if (!span) return;
	span.extra = { ...span.extra, ...extra };
}

export function end(span: Span | null, extra?: ExtraData) {
	if (!span) return;
	span.duration = Date.now() - span.startTime;
	span.extra = { ...span.extra, ...extra };
}

interface HCReqArg {
	dataset: string;
	apiKey: string;
	span: Span;
}

export function honeycombRequest({ dataset, apiKey, span }: HCReqArg) {
	return new Request(`https://api.honeycomb.io/1/batch/${dataset}`, {
		method: "POST",
		headers: {
			"X-Honeycomb-Team": apiKey,
			"content-type": "application/json",
		},
		body: JSON.stringify(span.spans.map((s) => s.hcJSON())),
	});
}
