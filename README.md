# Quel LLM pour mon PC

Application Mac et Windows qui **détecte ta configuration** (carte graphique, VRAM, RAM, puce Apple) et te dit **quels modèles LLM open-weight faire tourner en local** : quantification conseillée, mémoire utilisée, vitesse estimée et commande prête à copier (Ollama ou LM Studio).

La **liste des modèles est mise à jour chaque jour** dans `data/models.json`. L'application la télécharge à chaque lancement, donc pas besoin de la réinstaller pour voir les nouveaux modèles. Hors ligne, elle utilise la dernière liste téléchargée.

## Télécharger

Va dans **Releases** (colonne de droite sur GitHub) et prends :

| Système | Fichier |
|---|---|
| Mac Apple Silicon (M1 à M5) | `LLM-pour-mon-PC-x.y.z-mac-arm64.dmg` |
| Mac Intel | `LLM-pour-mon-PC-x.y.z-mac-x64.dmg` |
| Windows (installateur) | `LLM-pour-mon-PC-x.y.z-win-x64.exe` |
| Windows (sans installation) | `LLM-pour-mon-PC-x.y.z-portable.exe` |

### Premier lancement (application non signée)

- **Mac** : clic droit sur l'application > **Ouvrir**, puis **Ouvrir** dans la fenêtre. Si macOS dit que l'app est « endommagée », lance dans le Terminal :
  `xattr -cr "/Applications/Quel LLM pour mon PC.app"`
- **Windows** : si SmartScreen s'affiche, clique **Informations complémentaires** > **Exécuter quand même**.

## Comment c'est calculé

- **Mémoire** = paramètres × bits par poids (quantification) + cache de contexte + marge.
- **Vitesse** ≈ bande passante mémoire × rendement ÷ taille des poids *actifs* par token (d'où la rapidité des modèles MoE).
- Les vitesses et l'indice de qualité sont **indicatifs**.

## Développement

```bash
npm install
npm start          # lance l'app
npm run dist       # construit l'installateur pour ton système
npm run validate   # vérifie data/models.json
npm run build-web  # génère la version web autonome dans dist-web/
```

Chaque push sur `main` qui modifie `src/` ou `package.json` reconstruit les installateurs Mac et Windows via GitHub Actions et publie une release (pense à augmenter `version` dans `package.json`). Une mise à jour de `data/models.json` seule ne relance pas la compilation : l'app la récupère directement.
