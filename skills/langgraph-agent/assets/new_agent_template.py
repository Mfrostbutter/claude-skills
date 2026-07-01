"""COPY-PASTE TEMPLATE: a human-in-the-loop, two-model agent.

Drop this at `agents/<name>/graph.py` and adapt. It is a PURE FACTORY (no app
imports, lazy heavy imports) so it runs in Studio and your app alike. IO is
injected as `effects`. Progress is named AIMessages; the final result is an
unnamed AIMessage. The review node interrupts.

Shape:  START -> gather -> process -> draft -> review[interrupt] -> finalize -> END
"""

from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.types import interrupt
from pydantic import BaseModel, Field

# from .prompts import PROCESS_SYSTEM, DRAFT_SYSTEM   # keep prompts in a sibling file


class State(MessagesState):
    items: list          # gathered candidates
    selection: dict      # structured choice from the cheap model
    draft_md: str        # what the human reviews at the interrupt
    decision: dict       # {action: approve|edit|reject, edited: str}
    result_md: str


class Selection(BaseModel):
    keep: list[int] = Field(default_factory=list, description="Indices to keep.")


def build_template_graph(ranker, writer, effects: dict, checkpointer=None):
    """ranker = cheap model (structured selection); writer = quality model (prose).
    effects keys: gather()->list, persist(items)->None, stage(text, dry_run)->dict."""

    async def gather(state: State) -> dict:
        items = effects["gather"]()
        # NAMED message -> shows as a labeled timeline + graph step.
        return {"items": items,
                "messages": [AIMessage(content=f"Gathered {len(items)} items.", name="gather")]}

    async def process(state: State) -> dict:
        items = state["items"]
        chooser = ranker.with_structured_output(Selection)
        sel: Selection = await chooser.ainvoke([
            SystemMessage(content="Pick the strongest items. Return indices."),
            HumanMessage(content="\n".join(f"{i}. {it}" for i, it in enumerate(items))),
        ])
        keep = [i for i in sel.keep if 0 <= i < len(items)]
        return {"selection": {"keep": keep},
                "messages": [AIMessage(content=f"Selected {len(keep)} items.", name="process")]}

    async def draft(state: State) -> dict:
        keep = (state.get("selection") or {}).get("keep", [])
        chosen = [state["items"][i] for i in keep]
        ai = await writer.ainvoke([
            SystemMessage(content="Write the result. Verdict, not summary."),
            HumanMessage(content="Items:\n" + "\n".join(map(str, chosen))),
        ])
        text = ai.content if isinstance(ai.content, str) else str(ai.content)
        return {"draft_md": text.strip(),
                "messages": [AIMessage(content="Drafted the result.", name="draft")]}

    def review(state: State) -> dict:
        # HALT. The payload is what the human sees; resume carries the decision.
        decision = interrupt({"proposal": state.get("draft_md", ""), "modes": ["approve", "edit", "reject"]})
        return {"decision": decision or {}}

    async def finalize(state: State) -> dict:
        d = state.get("decision") or {}
        action = (d.get("action") or "approve").lower()
        if action == "reject":
            body = "## Rejected\n\nNothing was staged."
            return {"result_md": body, "messages": [AIMessage(content=body)]}  # unnamed -> final
        res = effects["stage"](state.get("draft_md", ""), dry_run=False)
        try:
            effects["persist"]([state["items"][i] for i in (state.get("selection") or {}).get("keep", [])])
        except Exception:
            pass
        body = (f"## Staged\n\n{res}") if res.get("ok") else f"## Staging failed\n\n{res.get('error')}"
        return {"result_md": body, "messages": [AIMessage(content=body)]}  # unnamed -> final result

    g = StateGraph(State)
    for name, fn in (("gather", gather), ("process", process), ("draft", draft),
                     ("review", review), ("finalize", finalize)):
        g.add_node(name, fn)
    g.add_edge(START, "gather")
    g.add_edge("gather", "process")
    g.add_edge("process", "draft")
    g.add_edge("draft", "review")
    g.add_edge("review", "finalize")
    g.add_edge("finalize", END)
    return g.compile(checkpointer=checkpointer)


# ── Wiring it into your app (the app-side builder; see reference/03) ───────────
#
# def build(llm, checkpointer=None):
#     import os
#     from langchain_anthropic import ChatAnthropic
#     from .effects import gather, persist, stage          # your injected IO
#     from .graph import build_template_graph
#     key = _anthropic_key_from(llm)                        # reuse the writer's key (see reference/02)
#     ranker = ChatAnthropic(model=os.environ.get("TEMPLATE_RANK_MODEL", "claude-haiku-4-5-20251001"),
#                            temperature=0, max_tokens=1024, api_key=key) if key else llm
#     effects = {"gather": gather, "persist": persist, "stage": stage}
#     return build_template_graph(ranker, llm, effects, checkpointer=checkpointer)
#
# Register it (if you keep a catalog): append an AgentDef(id="template", build=build, hitl=True, ...).
# Studio: in studio.py build it at module scope WITHOUT a checkpointer, using dry-run effects,
#   and point langgraph.json at "your_pkg.agents.studio:template".
