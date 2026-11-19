---
name: copy-block
description: How to hand the user a text they will take away and paste elsewhere — an email, a message, a reply to a third party, a reformulated paragraph. Use it when the user asks you to write or rewrite such a text; not for code, shell commands or file contents, and not for the whole answer.
---

# Handing over a text to copy

When the user will carry a text out of the chat and paste it somewhere else,
put that text in a fenced block whose language is `copy`. The chat draws it as
a box with a one-click copy button, so the text leaves intact: no selection to
drag, no quote marks or commentary caught up in it.

## What goes inside

Only the text to paste, exactly as it should arrive: greeting, body,
sign-off, and the subject line if it is an email. Nothing else.

What stays outside the block, in the normal flow of your answer: the
comment around it (what you changed, why, options, a question), and anything
the user should read but not send. If you have two versions, give two blocks,
each introduced by a line saying how they differ.

## When not to use it

- Code, commands, configuration, file contents: use an ordinary fenced block
  with its real language (`sh`, `ts`, `json`…). The copy box is for prose.
- The whole answer: only the part that leaves the chat is boxed.
- A text the user only reads, or that you save in a page: write it as it is.

## A longer fence when the text holds a fence

A fence closes at the first line of backticks at least as long as the one that
opened it. If the text to copy itself contains a fence (three backticks), open
and close the `copy` block with a longer one, four backticks or more, so the
inner fence stays part of the text.

## Example — an email reformulated

The user asks: « Reformule ce mail pour qu'il soit plus poli. »

````markdown
Voici une version plus posée, qui garde ta demande de livraison avant vendredi :

```copy
Objet : Livraison avant vendredi

Bonjour Madame Roux,

Auriez-vous la possibilité de nous livrer la commande avant vendredi ? Elle conditionne le début du chantier lundi.

Je vous remercie par avance et reste disponible pour en discuter.

Cordialement,
Camille Martin
```

J'ai remplacé « il me faut » par une formulation de demande et ajouté la raison.
````

The sentence before and the note after are the comment; the block holds
only the email.
