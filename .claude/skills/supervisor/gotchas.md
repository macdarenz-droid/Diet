# Supervisor gotchas

One line per incident that a rule would have caught. Newest last.

- **Carried over from M/ARC, 2026-09-30.** A `node_modules` symlink reached `main` because `.gitignore` said `node_modules/`, which matches only directories. This repo's `.gitignore` says `node_modules`, and the supervisor reads the whole PR diff before every merge.
