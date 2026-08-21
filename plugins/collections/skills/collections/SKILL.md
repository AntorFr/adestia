---
name: collections
description: How to declare a collection — a body of pages entered by a facet. Use when asked to organise pages by category, person, project type or any other attribute.
---

# Collections

A collection is **a page**, not code. Declaring one is how a new way of
browsing comes into existence; nobody edits the interface.

```markdown
---
type: collection
title: Projets
ico: 🗂
of: projet
groupBy: cat
labels: menuiserie=Menuiserie, electronique=Électronique
---

Les chantiers en cours, rangés par métier principal.
```

| Field | Meaning |
|---|---|
| `type` | **`collection`** — what makes the page a declaration |
| `of` | the `type` of the pages it collects. **Required**: without it the collection gathers nothing, and says so |
| `groupBy` | the frontmatter field that becomes the first grid of cards. Omit it to list the pages flat |
| `labels` | `value=Label` pairs, so a raw value can read properly without the code knowing your vocabulary |
| `ico` | the tile's glyph |

## What the members look like

Anything with a matching `type`. A project, for this example:

```markdown
---
type: projet
title: Rangement du garage
cat: menuiserie
status: en-cours
---
```

`status` (or `statut`) is shown as a chip if present. Its vocabulary is
yours — the collection displays whatever you wrote rather than checking it
against a list, so a fifth status does not silently disappear.

## The one rule worth remembering

**Never copy a page into a collection.** A collection is a QUERY: a page
appears in every collection whose `of` matches its `type`, and editing the
page updates all of them because there is only one page. A page duplicated
into a list is a page that will disagree with itself within the week.

A member missing the grouping facet is not hidden — it lands under
"Uncategorised", where someone can see it and fix it. Hiding it would make
the collection lie about its own size.
