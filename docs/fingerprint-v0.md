# The cart fingerprint, v0: our recipe

When a shopper says yes to a cart, Gilded Goose works out a short fingerprint of that exact cart and writes it into the
PayPal order's `custom_id`. Before any money is taken, the server works the fingerprint out again from the cart it holds
and compares it with the one PayPal's order carries. If they differ, it refuses to capture.

This page says exactly how the fingerprint is made, so anyone can work one out and check ours. It is written from the
code (`cartCanonical` and `bindingHash` in [`trust/src/cart.ts`](../trust/src/cart.ts)), and
[`trust/test/vectors.json`](../trust/test/vectors.json) holds 16 carts with their fingerprints to test against.

**This is our recipe, not a standard.** Nobody else has agreed to it, PayPal does not read or check it, and "v0" means
it may change. It is one small, plain way to tie an approval to an order.

## Read this first: the hash has no key

The fingerprint is a plain SHA-256. There is no secret in it. **Anyone who has the cart's fields can work out the same
fingerprint**, so a matching fingerprint proves nothing about who made it. It is not a signature.

What does the binding is two things together:

1. **PayPal's order holds the fingerprint.** It is written to `custom_id` when the order is created
   (`create` in [`trust/src/paypal.ts`](../trust/src/paypal.ts)), before the shopper sees PayPal's page.
2. **The server refuses to capture a cart whose fingerprint, worked out again, is different.** `settle` in
   [`trust/src/guard.ts`](../trust/src/guard.ts) re-hashes the cart it holds, re-reads the order from PayPal, and
   `checkBoundCart` compares the two before any capture.

So a price, item, seller or expiry changed after the yes gives a different fingerprint from the one PayPal holds, and
the capture is refused. The fingerprint by itself stops nothing; the order holding it and the server checking it do.

## The fields, in order

The fingerprint covers the cart and this one approval of it. The order below is fixed.

| # | Field | Type in the text | What it is | Example |
|---|---|---|---|---|
| 1 | `item` | string | The item's name | `"Goldfeather Kettle (fictional)"` |
| 2 | `merchant` | string | The seller's display name | `"Reedbank Outfitters (fictional)"` |
| 3 | `sellerId` | string | The seller's id | `"reedbank"` |
| 4 | `qty` | number | How many | `1` |
| 5 | `price` | **string** | The cart's total as dollars and cents | `"47.73"` |
| 6 | `currency` | string | The currency code (only `USD` today) | `"USD"` |
| 7 | `shape` | string | `one-off`, `pay-later`, `subscription` or `free-trial` | `"one-off"` |
| 8 | `catalogId` | string or `null` | The catalog entry the cart is for. **Only if the cart names a catalog entry or a payee.** | `"kettle"` |
| 9 | `payee` | string or `null` | The PayPal merchant id paid. **Only if the cart names a catalog entry or a payee.** | `null` |
| 10 | `attributes` | list of `[key, value]` pairs | What the listing says of the item. **Only if the cart has attributes.** | `[["colour","gold"]]` |
| 11 | `nonce` | string | 32 hex characters, new for every approval, so the same cart approved twice gets two fingerprints. Not a secret. | `"9ce301efb8829f5b6d01076ffeacb770"` |
| 12 | `expiresAt` | number | When the approval runs out: milliseconds since Jan 1 1970 UTC. Fifteen minutes after the approval was asked for. | `1760000900000` |

Three rules about the optional fields:

- **8 and 9 come as a pair.** If the cart names neither a catalog entry nor a payee, both are left out. If it names
  either one, both places are written, and the missing one is `null`.
- **10 is left out when the cart has no attributes.** When it has them, they are one list of `[key, value]` pairs,
  sorted by key. The sort compares keys as JavaScript compares strings (by UTF-16 code unit), so `"Finish"` comes
  before `"colour"`. An attributes object with nothing in it still adds an empty list `[]`, so it is not the same as
  no attributes.
- The order of fields in your own data does not matter. The recipe's order is the only order.

In the code the total is held as whole cents (`4773`). In the text it is written as dollars, a dot, and exactly two
digits of cents, with no separators: `"47.73"`, `"0.00"`, `"1234567.05"`. A total that is not a whole, non-negative
number of cents has no fingerprint; the code throws.

## The exact text

Put the fields in a JSON array in that order and write it the way JavaScript's `JSON.stringify` does:

- no spaces or line breaks anywhere;
- strings in double quotes; `"` and `\` escaped as `\"` and `\\`; newline, tab, carriage return, backspace and form
  feed as `\n`, `\t`, `\r`, `\b`, `\f`; any other character below U+0020 as `\u00xx` with lowercase hex;
- every other character written as itself, not escaped: accents, emoji and `/` stay as they are. The one exception
  is a lone surrogate (half of a UTF-16 pair with no partner, which well-formed text never has): it is written as
  `\udxxx` with lowercase hex;
- `qty` and `expiresAt` as plain JSON numbers.

Nothing is trimmed, lowercased or normalized. A trailing space, a capital letter, or the same accent typed a different
way in Unicode gives a different fingerprint.

The recipe is defined for whole-number `qty` and `expiresAt`, which is what every cart Goose makes has. For anything
else the answer is whatever `JSON.stringify` prints, and we do not promise that here.

## The hash

1. Take the UTF-8 bytes of that text.
2. SHA-256 them, and write the result as lowercase hex (64 characters).
3. Keep the **first 32 characters**. That is the fingerprint: 128 of the hash's 256 bits.

Those 32 characters are what goes in `custom_id`, with nothing before or after them.

## A worked example

This is the cart Goose held for the shopper's yes in recorded week 1 (a practice run with fictional sellers; no PayPal
order was made for it). Its fingerprint is in `docs/fixtures/tape-seed-1.json`.

The text (168 bytes, one line):

```
["Goldfeather Kettle (fictional)","Reedbank Outfitters (fictional)","reedbank",1,"47.73","USD","one-off","kettle",null,"9ce301efb8829f5b6d01076ffeacb770",1760000900000]
```

The cart names a catalog entry (`kettle`) and no payee, so place 9 is `null`. It has no attributes, so place 10 is
left out.

SHA-256 of those bytes:

```
79bb57798eb7360767778c2bd795f0c3499f520e91f5abfd0b49533cc0950c69
```

The fingerprint, its first 32 characters:

```
79bb57798eb7360767778c2bd795f0c3
```

You can check it with nothing but a shell:

```sh
printf '%s' '["Goldfeather Kettle (fictional)","Reedbank Outfitters (fictional)","reedbank",1,"47.73","USD","one-off","kettle",null,"9ce301efb8829f5b6d01076ffeacb770",1760000900000]' | shasum -a 256 | cut -c1-32
```

Change the total to `"47.74"` and the fingerprint becomes `ffa30679bee07af4c96d51883bca4971`. One cent, a different
fingerprint.

## Test vectors

[`trust/test/vectors.json`](../trust/test/vectors.json) has 16 carts. Each has a name, a note, the cart (with `price`
in whole cents, as the code holds it), the nonce, the expiry, the exact text, and the fingerprint. They include a
one-cent change, a different payee, a payee without a catalog entry, accents and an emoji, characters that need
escaping, fields written in another order, attributes in another order, an empty attributes object, a $0.00 total and
a large total. A vector marked `sameAs` must equal the vector it names; one marked `differsFrom` must not.

- The file is written by `node scripts/fingerprint-vectors.ts` from the shipped `cartCanonical` and `bindingHash`. It
  is never edited by hand.
- `trust/test/vectors.test.ts` works every vector out again with the real functions on every `pnpm check`.
- `core/test/fingerprint-recompute.test.ts` holds a second telling, written from this page and running on the
  browser's Web Crypto (`web/src/verify/recompute.ts`), equal to the real function on every vector.

If you write your own version, pass all 16 and you match ours. A hint for Python: `json.dumps(fields,
ensure_ascii=False, separators=(",", ":"))` gave the same text for all 16 when we tried it by hand on Nov 11 2026.
That check is not part of `pnpm check`, and Python sorts strings by code point, which differs from JavaScript's order
for some rare attribute keys.

## Where it is checked

- **When the order is created:** `custom_id` is set to the fingerprint, and the order's amount comes from the same
  cart's total, never from any text.
- **Before capture** (`settle`): the server re-hashes the cart it holds and refuses if that is no longer the
  fingerprint it was approved with ("cart changed since it was bound"). It then re-reads the order from PayPal and
  refuses unless the order's id is this cart's, its `custom_id` is this fingerprint, its amount and currency are the
  cart's, its payee is the cart's when the cart names one, it was placed to take the money the same way (compared when
  the order read reports how), PayPal shows it approved, and the approval has not run out.
- **After a hold** (orders placed to authorize first): the cart is re-hashed and the order re-read once more before
  the held money is taken; a difference voids the hold.

## What this does not protect against

- **It is not a signature.** No key, so no proof of who wrote a fingerprint. Anyone with the fields can make one.
- **It does not protect you from the server itself.** The same server binds the cart, creates the order and decides
  whether to capture. A dishonest or broken-into server can create any order it likes. The fingerprint makes a change
  after the yes visible and refused by honest code; it does not make the code honest.
- **Whoever holds the merchant's PayPal API keys may be able to change `custom_id`.** As we read PayPal's Orders v2
  reference (https://developer.paypal.com/docs/api/orders/v2/, "Update order", read Nov 11 2026), `custom_id` is among
  the fields an order's creator can update while the order is created or approved, before capture. We have not tried
  it in the sandbox. The binding assumes those keys are held by the server that runs this check.
- **PayPal does not check it.** To PayPal, `custom_id` is a label. PayPal will capture an order whatever it says. Only
  a server running this check refuses.
- **The shopper does not see it.** PayPal's approval page shows the amount and the store's name, not the fingerprint.
- **It does not cover everything about an order.** The order's own amount, currency, payee and intent are read back
  from PayPal and compared one by one, because a fingerprint in `custom_id` cannot see a value swapped on the order
  itself. The description PayPal shows (the item's name, cut to 127 characters) is not compared. Who the shopper is,
  shipping, tax and line items are not in the fingerprint at all: it has one total.
- **It is cut to 128 bits.** Plenty against accidents and against finding a second cart for a fingerprint someone
  else chose. But whoever picks both carts could look for two with the same fingerprint in about 2^64 tries, which a
  large effort can reach. That party is the server, which this recipe already does not protect you from.
- **It does not stop a cart being used twice.** That is the ledger's job: a cart is claimed before any call to PayPal.
- **It hides nothing.** The nonce is not a secret, and in the recorded demo weeks it comes from a seeded generator so
  the weeks replay the same way every time.
- **It carries no version.** Nothing in the fingerprint says "v0". If the recipe changes, old and new fingerprints
  cannot be told apart by looking at them.
- **A fingerprint you recompute on our site uses fields our server sent.** The page shows that the fields work out to
  that value. To know PayPal holds the same value without trusting us, a merchant reads the order from PayPal with
  their own keys.
