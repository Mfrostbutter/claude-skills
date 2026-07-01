# LangGraph Studio — `langgraph dev` setup

LangGraph Studio (the browser app) needs a local **agent server** to connect to. That server
is `langgraph dev` — a local Python process (NOT Docker) that serves on `127.0.0.1:2024`.
"Failed to initialize Studio / TypeError: Failed to fetch" = no server running there.

## Procedure

1. **Install the CLI + STABLE server pins.** `pip install "langgraph-cli[inmem]"` can pull
   mutually-incompatible PRERELEASE server builds that crash on startup (e.g.
   `AttributeError: ... LSD_PROM_METRICS_ENABLED`). Pin the stable pair:
   ```
   pip install "langgraph-cli[inmem]"
   pip install "langgraph-api==0.10.0" "langgraph-runtime-inmem==0.30.0"
   ```
   This does not touch `langgraph` core (1.x) or your agent code.

2. **Make the package importable + reference the graph by MODULE path.** If the Studio entry
   uses relative imports (`from .config import ...`), a file-path graph spec fails with
   "attempted relative import with no known parent package". Fix with an editable install and
   a module-path spec:
   ```
   pip install -e .
   ```
   ```json
   // langgraph.json
   {
     "dependencies": ["."],
     "graphs": { "my_agent": "my_pkg.studio:graph" },   // module path, NOT ./src/.../studio.py:graph
     "env": ".env"
   }
   ```

3. **The Studio graph entry should build without credentials.** Construct the graph at module
   scope with dry-run effects and placeholder models when keys are absent, so topology renders
   without secrets; build real models only if keys are present (for actually running it).

4. **Run it (background) and connect.**
   ```
   langgraph dev --no-browser --port 2024
   ```
   In the Studio dialog, set Base URL `http://127.0.0.1:2024` → Connect.

## Health checks

- Server up: `GET http://127.0.0.1:2024/ok` → 200
- Graph registered: `POST http://127.0.0.1:2024/assistants/search` with `{}` → returns your
  graph as an assistant
- Boot errors: read the dev server log; `GraphLoadError` = a spec/import problem (see step 2),
  startup `AttributeError` = the prerelease version mismatch (step 1).

## Notes

- `langgraph.json`'s `"env": ".env"` loads a (gitignored) `.env` for the server — put the
  model keys there so Studio can actually invoke the graph, not just view topology.
- The server keeps running until stopped; it's a normal local process, not a container.
