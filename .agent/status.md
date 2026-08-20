# Status — Golem
> MàJ : 2026-08-20

**État :** Spikes 1-3 TERMINÉS, vérifiés de seconde main, commités-poussés
(a5484e2 → b50a28c). ESM runtime PROUVÉ (16/16, Chrome réel). Copilot CLI
recon complet (JSONL capturé via mock BYOK, 3 états d'auth, session-store.db,
catalogue modèles, flag --acp découvert). Éditeurs : Milkdown ET Tiptap
byte-identiques sur les 2 fixtures (zéro normalisation) ; BlockNote éliminé
(0/2, pas de hook markdown). EN ATTENTE : verdict comparatif Milkdown vs
Tiptap — moment Fable suggéré à l'utilisateur.

**Prochaines étapes :**
- [ ] Verdict éditeur Milkdown vs Tiptap (critères 2e ordre : DX blocs custom, couplage pipeline, plafond UX, écosystème, risques — cf. open_questions des 2 rapports)
- [ ] Reporter dans DESIGN.md : ghp_ rejeté bruyamment (correction), option --acp Copilot à évaluer, leçons import map (jsx-runtime day one, contrat de spécificateurs versionné)
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis, brûle du quota)
- [ ] Figer schemaVersion 1 des manifestes plugin/skin (nourri par les spikes)
- [ ] Squelette monorepo (core / web / sdk / drivers) et contrat driver v0
- [ ] Skills plugin-author / skin-author sur les schémas gelés
