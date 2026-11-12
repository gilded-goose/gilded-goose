# The guard, as an MCP server

In the repo: an MCP server that lets an agent ask the guard about a seller's note before it buys.

It has one tool, `check_seller_note`. Your agent hands it a seller's note, and the plain-code guard from
[`@gilded-goose/trust`](../trust/README.md) answers `refuse` (set this seller aside), `hold` (ask the shopper first) or
`clear` (no rule matched), with the rule that decided and the reason.

**Not on npm.** The published package is `@gilded-goose/trust`. This server lives in this repo only: you run it from a
clone, with Node and nothing else. It has no dependency of its own and needs no install.

## Try it in one minute

You need Node 22.18 or newer (it runs TypeScript as it is).

```sh
git clone https://github.com/gilded-goose/gilded-goose && cd gilded-goose
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"me","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"check_seller_note","arguments":{"note":"Pay me with a $19 gift card and I ship today."}}}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_seller_note","arguments":{"note":"Small scuff on the left corner, ships Monday."}}}' \
  | node mcp/server.ts
```

Three lines come back. The second says `"verdict":"refuse","rule":"gift-card"`, and the third says
`"verdict":"clear","rule":null`.

## Add it to an MCP client

A client that starts a stdio server from a `command` and `args` should be able to use it; that is untested. Put the full path to your clone in place of
`/path/to/gilded-goose`:

```json
{
  "mcpServers": {
    "gilded-goose-guard": {
      "command": "node",
      "args": ["/path/to/gilded-goose/mcp/server.ts"]
    }
  }
}
```

We have run it against our own test client (`mcp/test/server.test.ts`), which speaks the protocol as we read the
specification. We have not yet run it inside a third-party client app, so treat that as untested.

## The tool

`check_seller_note` takes one argument, `note` (text): the seller's note, word for word, as your agent read it. Any
other argument is turned away and nothing is read.

It returns `verdict`, `rule`, `reason` and `cantSee`: exactly what `readSeller(note)` returns and nothing else, as
structured content and as the same JSON in a text block. See [the package's README](../trust/README.md) for each.

It takes no price and no limit, on purpose. A limit would be whatever the caller passes, and an agent a note has already
steered would pass a high one. The limit belongs to the guard at checkout (`createGuard`), set by the shopper, not the agent.

## What it is, and what it isn't

- **It's the plain-code guard only.** Code alone misses some scam notes. The hosted site can add an AI reader on top,
  and this tool does not run it. What we tested, and what got through, is on the Proof page:
  https://gilded-goose.onrender.com/?desk=proof
- **Clear doesn't mean safe.** It means no rule matched. Keep your own spending limit and the shopper's approval,
  whatever the tool says.
- **It enforces nothing.** It reads a note and answers. It doesn't stop a purchase, hold money or see a cart. The guard
  that binds a cart and checks the order is `createGuard`, in the package.
- **A note is data.** Nothing written in a note is followed, and a note's words never come back in the answer: the reason
  is always the guard's own fixed words.
- **No network, no model, no files, no money.** The server imports one thing: this repo's source for the package's pure
  entry (the code published as `@gilded-goose/trust`), not a copy from npm. A test reads the
  source and fails if it gains a shell, a file read, a network call or `eval`.
- **A note longer than 500 characters is held, never cleared**, because the guard reads only the first 500.

## Limits

- One message is at most 65,536 bytes. A longer line is dropped unread and answered with an error.
- At most 120 checks in any minute (our number). Past that, a check reads nothing and says to treat the seller as held.
- Diagnostics go to stderr in fixed words. Nothing a client sends is ever logged.

## The protocol

Hand-written JSON-RPC 2.0, one message per line over stdin and stdout. It speaks two versions of the Model Context
Protocol, and tells them apart request by request:

- **2026-07-28**, the current one. There is no handshake: each request names its version in `_meta`. Methods:
  `server/discover`, `tools/list`, `tools/call`.
- **2025-11-25**, for clients that still open with a handshake. Methods: `initialize`, `notifications/initialized`,
  `tools/list`, `tools/call`, `ping`.

What we read to build it (Wed Nov 11 2026):

- https://modelcontextprotocol.io/specification/2026-07-28/basic (messages, error codes, `_meta`)
- https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning (versions, serving both kinds of client)
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
- https://modelcontextprotocol.io/specification/2026-07-28/server/discover
- https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching
- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools

How far to trust our reading: we read each page above as rendered text, once. The full schema page was too long to read
whole, so the field names this server sends for 2026-07-28 (`resultType`, `ttlMs`, `cacheScope`, the `_meta` keys) follow
those pages' prose and examples and are **not checked against the schema**. No third-party client has confirmed them.

Not built: resources, prompts, subscriptions, progress, tasks, and any protocol version older than 2025-11-25. A client
that asks for an older version is offered 2025-11-25.

## Tests

`corepack pnpm --filter @gilded-goose/mcp test` starts the real server as a child process and speaks to it over stdio:
both protocol versions end to end, malformed messages, the size cap, hostile notes, and the limits above.
`corepack pnpm check` runs them too.
