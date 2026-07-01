# 01 · LangGraph 1.x API cheat sheet

Exact imports + idioms. Pins: `langgraph==1.2.4`, `langchain-core==1.4.6`, `langchain-anthropic==1.4.5`.

## Build a graph

```python
from langgraph.graph import START, END, StateGraph, MessagesState

class S(MessagesState):        # MessagesState gives you the `messages` channel free
    target: str                # add your own typed channels
    findings: list             # list channels are additive across parallel nodes

g = StateGraph(S)
g.add_node("investigate", investigate)        # async or sync def node(state) -> dict
g.add_edge(START, "investigate")
g.add_conditional_edges("investigate", route, {"a": "node_a", END: "done"})
g.add_edge("done", END)
graph = g.compile(checkpointer=checkpointer)  # checkpointer only needed for interrupt/resume
```

A node returns a **partial state dict**; returned keys are merged. To emit progress, return `{"messages": [AIMessage(content="...", name="investigate")]}`.

## Models

```python
from langchain_anthropic import ChatAnthropic
llm = ChatAnthropic(model="claude-sonnet-5", temperature=0, max_tokens=4096, api_key=key)
bound = llm.bind_tools(list(tools))           # for ReAct loops
ai = await bound.ainvoke([SystemMessage(...), *state["messages"]])
```

## Structured output (selection / assessment / verdict nodes)

```python
from pydantic import BaseModel, Field
class Assessment(BaseModel):
    severity: int = Field(description="1-5"); is_fixable: bool = False
out: Assessment = await llm.with_structured_output(Assessment).ainvoke([SystemMessage(...), HumanMessage(...)])
# validated object, retried on mismatch, no JSON parsing.
```

Anthropic gotcha: end the message list on a **human** turn (a trailing assistant message is treated as prefill and rejected). When you "replay" a tool loop into a tool-less call, rebuild a clean 2-turn `[System, Human(diagnosis)]` instead of forwarding the loop history.

## ReAct tool loop

```python
from langgraph.prebuilt import ToolNode, tools_condition
g.add_node("tools", ToolNode(list(tools)))
g.add_conditional_edges("investigate", tools_condition, {"tools": "tools", END: "next"})
g.add_edge("tools", "investigate")
```

## Interrupt + resume

```python
from langgraph.types import interrupt, Command
def review(state):              # HALTS here; payload surfaces to the human
    return {"decision": interrupt({"proposal": state["draft"]}) or {}}
# resume: graph.astream(Command(resume={"action": "approve"}), config, ...)
```

## Stream a run

```python
config = {"recursion_limit": 25, "configurable": {"thread_id": run_id}}
async for upd in graph.astream(state, config, stream_mode="updates"):
    if "__interrupt__" in upd:               # paused
        val = upd["__interrupt__"][0].value  # your interrupt payload
        break
    for node, payload in upd.items():
        for m in payload.get("messages", []):
            ...                              # AIMessage(name=...) = step; unnamed = final
```

## Checkpointer

```python
from langgraph.checkpoint.memory import MemorySaver   # in-memory; survives a pause, not a restart
graph = g.compile(checkpointer=MemorySaver())
```

Interrupt/resume needs BOTH a checkpointer AND a stable `configurable.thread_id`. Resume reuses the SAME compiled graph object (its checkpointer holds the paused state).

## Topology (for visualization)

```python
cg = graph.get_graph()
nodes = list(cg.nodes.keys())                 # ['__start__','investigate',...,'__end__']
edges = [(e.source, e.target, getattr(e, "conditional", False)) for e in cg.edges]
```

`get_graph()` does not invoke the model, so you can build with a keyless model just to read the shape.
