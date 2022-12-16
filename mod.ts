type ExtraData = Record<string, null | boolean | string | number | undefined>;

interface Span {
	getTrace: () => Span[]; // get all the spans in the trace
	service: string; // the service the span is from
	name: string; // role of the span
	startTime: number; // when the span starts
	duration?: number; // known when complete
	spanId: string; // uniquely identifies the span
	traceId: string; // identifies which trace the span belongs to
	parentId?: string; // the parent span that created this span
	extra?: ExtraData; // extra data that might be helpful.
}

interface CreateArg {
	skip?: boolean;
	parent?: Request;
	service: string;
	name: string;
	extra?: ExtraData;
}

export function create(arg: CreateArg): Span | null {
	if (arg.skip) return null; // short circuit
	const { service, name, extra, parent } = arg;
	const trace: Span[] = [];
	const span: Span = {
		getTrace: () => trace,
		service,
		name,
		spanId: crypto.randomUUID(),
		traceId: parent?.headers.get("x-trace-id") ?? crypto.randomUUID(),
		parentId: parent?.headers.get("x-parent-id") ?? undefined,
		startTime: Date.now(),
		extra,
	};
	trace.push(span);
	return span;
}

export function restart(span: Span | null) {
	if (!span) return null;
	span.startTime = Date.now();
	span.duration = undefined;
	return span;
}

export function end(span: Span | null, extra?: ExtraData) {
	if (!span) return;
	span.duration = Date.now() - span.startTime;
	if (extra) Object.assign(span.extra ?? {}, extra);
	return span;
}

// propagate
// span -> honeycomb request
