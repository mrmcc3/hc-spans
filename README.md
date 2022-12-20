### hc-spans

I wanted a simple way to send trace data to [Honeycomb][hc] from [deno][deno] & deno deploy apps.
See the honeycomb docs for more info on [Distributed Tracing][dt] and `example.ts` for sample usage.

I understand [OpenTelemetry][otel] is the recommended method for both instrumenting code and sending
trace data to honeycomb. However at the moment the default SDKs don't seem to support Deno. Also to
be honest I find it incredibly hard to understand how all the otel libraries work. Fortunately
Honeycomb still supports manually sending JSON span data over http. That's what this library does.

Where possible spans are sent using attribute names outlined by [honeycomb][hcsend]. When sending
ad-hoc/extra data consider using [opentelemetry semantic conventions][sc]

[deno]: https://deno.land/
[hc]: https://www.honeycomb.io/
[dt]: https://docs.honeycomb.io/getting-data-in/tracing/
[otel]: https://github.com/open-telemetry/opentelemetry-js
[hcsend]: https://docs.honeycomb.io/getting-data-in/tracing/send-trace-data/#opentelemetry
[sc]: https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/
