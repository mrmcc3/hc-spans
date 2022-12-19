I wanted a simple way to send trace data to [Honeycomb][hc] from 
[deno][deno] & deno deploy apps. See the honeycomb docs for more 
info on [Distributed Tracing][dt]. I understand [OpenTelemetry][otel] is the 
recommended method for both instrumenting code and sending trace data to honeycomb.

However at the moment it seems to be a non-starter for Deno. Also to be honest 
I find it incredibly hard to understand how it all works. Fortunately 
Honeycomb supports manually sending JSON span data over http. That's
what this library does.

### UPDATE

Seems they have deprecated their manual API. So this will never be released.
Time to dig into the otel json protocol and hopefully honeycomb will 
accept it.

[deno]: https://deno.land/
[hc]: https://www.honeycomb.io/
[dt]: https://docs.honeycomb.io/getting-data-in/tracing/
[otel]: https://github.com/open-telemetry/opentelemetry-js
