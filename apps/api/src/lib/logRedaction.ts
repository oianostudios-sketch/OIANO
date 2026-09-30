// apps/api/src/lib/logRedaction.ts
//
// A request URL can itself be a credential. The notification stream and file
// downloads authenticate with `?ticket=`, because EventSource and a plain link
// cannot send an Authorization header, so a log line that records the URL
// records a working ticket for up to a minute (audit finding A14). A list of
// secret parameter names would protect only the routes someone remembered to
// add to it, so every query value is replaced instead. Names stay, so a line
// still shows what a request carried.
const REDACTED = '[redacted]';

// Anything else in the name position is more likely a value sent without a
// name (`/stream?<ticket>`) than a parameter, so it is replaced as well.
const PARAMETER_NAME = /^[\w.%[\]-]{1,40}$/;

export function redactUrlForLog(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;

  const pairs = url.slice(queryStart + 1).split('&').map((pair) => {
    if (pair === '') return pair;
    const separator = pair.indexOf('=');
    if (separator === -1 || !PARAMETER_NAME.test(pair.slice(0, separator))) return REDACTED;
    // An empty value hides nothing, and seeing it explains a "missing ticket".
    return separator === pair.length - 1 ? pair : `${pair.slice(0, separator)}=${REDACTED}`;
  });
  return `${url.slice(0, queryStart)}?${pairs.join('&')}`;
}
