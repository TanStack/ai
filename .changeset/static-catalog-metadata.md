---
'@tanstack/ai-skills': patch
---

`generateCatalog` and `staticSkills` now keep a skill's frontmatter `metadata` map, matching `skillDirectory`. The catalog `revision` now changes when a skill's frontmatter or resources change, not only its body.
