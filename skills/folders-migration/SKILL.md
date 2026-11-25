---
name: folders-migration
description: Bring an instance that still dresses its folders with `INDEX.md` or a homonymous page (`x/x.md`) to the folder settings file `.folder.md`, once, after the version that reads `.folder.md` is deployed. Use only when the owner asks to migrate the folders. Never delete a page; safe to run twice.
---

# Migrating folders to `.folder.md`

Before this version a folder took its name, icon, colour and plugin from a page: `INDEX.md`
(any case) in the folder, or the page `x/x.md` that bears the folder's name. Now those
settings live in `<folder>/.folder.md`, a file of front matter only, and `INDEX.md` and
`x/x.md` are ordinary pages. Nothing reads the old settings in a page any more: until you
have run this, such a folder has lost its icon and colour and, if an index declared its
`app:`, its plugin. You bring them back, once.

You write settings with the `folder_settings` tool, never by writing `.folder.md` with your
file tools: the tool refuses a bad value and a stale revision, and a file you wrote yourself
skips both. You edit the pages themselves with your file tools. You never delete a file,
and you never touch the text of a page.

## The six steps

1. **List the candidates.** Look through the memory for every file named `INDEX.md`, in any
   case (`index.md`, `Index.md`), and every page `x/x.md` whose name is the name of the
   folder that holds it. Each gives one pair: the page and its folder `x` (for `INDEX.md`,
   the folder that holds it). A page at the root of the memory has no folder: leave it, and
   say so in the report. Read the front matter of each page.
2. **Keep the pages that carry something.** The old settings are four front-matter keys:
   `title`, `ico`, `couleur`, `app`. A page that has none of the four is left alone, and
   the report says so. A page that has only some of them (only `ico`, or only `title`)
   is migrated like the others, for the keys it has. When a folder has both an `INDEX.md`
   and a homonymous page, take the index first, then the homonymous page for the keys the
   index did not give.
3. **Copy the settings.** For each pair, call `folder_settings` with `action: get` and note
   the `revision`. Then `action: set`, with that `revision`, passing **only the keys the
   folder's settings do not already hold**: a value already in `.folder.md` is newer than
   the page's and wins, and a value equal to the page's needs no write. Nothing to pass,
   no call. The tool merges, so the other settings stay. If it refuses (a colour outside
   the palette, a folder that cannot be written, a stale revision: read again and retry
   once), leave that page **untouched**, and put the folder and the reason in the report.
4. **Clean the page.** Only for a pair whose settings are now in `.folder.md` (just written,
   or already equal), remove the `couleur` and `app` lines from the page's front matter.
   **Keep `title` and `ico`**: on an ordinary page they are its own name and its card's icon,
   so nothing visible is lost. Keep the other front-matter fields and the whole text exactly
   as they are, byte for byte; change nothing but those lines.
5. **Look.** For a few of the migrated folders, call `folder_settings` with `action: get`
   and compare with what the page had; open the folder (`#/section/<folder>`): same icon,
   same colour, same owner, the text of the old index shown as a page of the folder, the
   files of the folder under **Attachments**.
6. **Report.** Answer the owner with three lists: the folders migrated, each with the keys
   moved; the pages left alone and why (no old key; at the root; already migrated); the
   refusals and their reasons. State plainly that no file was deleted.

## Running it twice

A second run finds the same pages, but their `couleur` and `app` are gone and `title` and
`ico` equal what `.folder.md` holds: step 3 has nothing to pass and step 4 nothing to
remove. It changes no file. If a first run was cut off, run it again from step 1.

## What you do not do

- Do not delete, rename or move a page, an index included. The old index stays as an
  ordinary page of its folder.
- Do not rewrite a page's text, nor its other fields.
- Do not guess a value: a colour that is not one of the palette's hues is reported, not
  corrected.
- Do not write `.folder.md` yourself, and do not put text in it.
- If you cannot reach `folder_settings`, stop and say so: the owner runs the same steps by
  hand from this text.
