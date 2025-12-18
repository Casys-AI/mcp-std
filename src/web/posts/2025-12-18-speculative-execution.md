---
title: "Speculative Execution: Running Tasks Before You Know You Need Them"
slug: speculative-execution
date: 2025-12-18
category: engineering
tags:
  - performance
  - speculation
  - optimization
  - parallelism
snippet: "What if you could predict the future? Speculative execution runs likely-needed tasks before confirmation, then discards wrong predictions. The result: dramatically faster workflows."
format: article
language: en
author: Erwan Lee Pesle
---

# Speculative Execution: Running Tasks Before You Know You Need Them

> Betting on the future to win time in the present

## The Waiting Problem

AI workflows are latency-bound. Each step waits for the previous one.

| Operation | Typical Latency |
|-----------|-----------------|
| LLM call | 500ms - 3s |
| Tool execution | 10ms - 500ms |
| User confirmation | 0 - ∞ |

```mermaid
graph LR
    subgraph "Sequential (Slow)"
        A[Task A] --> W1[Wait] --> B[Task B] --> W2[Wait] --> C[Task C]
    end
```

A 5-step workflow at 1s per LLM call = 5 seconds minimum. Most of that time? Waiting.

## The Speculation Idea

Borrowed from CPU design: **start likely-needed work before you're certain you need it**.

The bet:
1. Predict what task comes next (using graph patterns)
2. Start that task in parallel with current work
3. If prediction correct → result is ready, no wait
4. If prediction wrong → discard and continue normally

```mermaid
graph TD
    subgraph "Speculative (Fast)"
        A[Task A] --> B[Task B]
        A --> S1[Speculative C]
        A --> S2[Speculative D]
        B --> C[Confirm C ✓]
        S1 -.->|discard if wrong| X[Discard]
    end
```

The key insight: **wrong predictions cost compute, not correctness**. You just throw away wasted work.

## When To Speculate

Not all predictions are equal. The decision depends on confidence and cost.

| Confidence | Action | Reasoning |
|------------|--------|-----------|
| >90% | Speculate immediately | High hit rate, low waste |
| 70-90% | Speculate if cheap | Worth the gamble on low-cost tasks |
| <70% | Wait | Too much wasted work |

**Cost matters too:**

```mermaid
graph TD
    P[Prediction 85%] --> C{Cost?}
    C -->|Low: file read| S1[Speculate ✓]
    C -->|High: API call| W1[Wait]
```

A cheap speculation at 70% confidence might be worth it. An expensive speculation at 90% might not be.

## The GraphRAG Advantage

This is where our graph structure pays off. The graph knows:

| Signal | What It Tells Us |
|--------|------------------|
| **Edge weights** | How often tasks follow each other |
| **PageRank** | Which tasks are important |
| **Capabilities** | Natural task groupings |
| **Historical success** | What actually worked before |

```mermaid
graph LR
    Current[Current Task] --> G[GraphRAG Query]
    G --> P1[Next: 95% confidence]
    G --> P2[Alternative: 78%]
    G --> P3[Unlikely: 45%]
    P1 --> S1[Speculate ✓]
    P2 --> S2[Maybe speculate]
    P3 --> W[Don't speculate]
```

After `git_commit`, the graph might show:
- `github_push`: 95% (almost always follows)
- `slack_notify`: 60% (often follows)
- `aws_deploy`: 20% (rarely follows directly)

We speculate on `github_push` immediately. The graph learned this pattern from usage.

## Handling Wrong Predictions

Wrong predictions must be harmless. The strategy:

### 1. Sandbox Speculative Work

Speculative tasks run in isolation:
- No permanent side effects
- Results held in memory only
- External calls deferred or mocked

### 2. Confirm Before Commit

```mermaid
graph TD
    S[Speculative Result] --> C{Prediction Correct?}
    C -->|Yes| A[Apply result]
    C -->|No| D[Discard silently]
```

### 3. Learn From Misses

Wrong predictions aren't just discarded—they're feedback:
- Decrease edge weight for that transition
- The graph gets smarter over time
- Fewer wasted speculations in the future

## Performance Trade-offs

The fundamental trade-off: **compute for latency**.

| Factor | Impact |
|--------|--------|
| Successful speculation | Latency saved = task duration |
| Failed speculation | Compute wasted = task cost |
| Hit rate | Determines if trade-off is worth it |

```mermaid
graph LR
    subgraph "The Trade-off"
        L[Lower Latency] <-->|costs| C[More Compute]
    end
```

The break-even point depends on your hit rate and cost ratio. We use a 70% confidence threshold with adaptive adjustment.

**When it's worth it:**
- Interactive workflows where user waits
- High-confidence prediction scenarios
- Cheap speculative operations

**When it's not:**
- Batch processing (latency doesn't matter)
- Expensive operations (compute cost too high)
- Low-confidence predictions (too much waste)

---

## References

- CPU speculation (branch prediction) as inspiration

#Performance #Speculation #Optimization #Parallelism
