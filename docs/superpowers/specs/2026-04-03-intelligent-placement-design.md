# Intelligent VM Placement & DRS-like Recommendations — Design Spec

**Date:** 2026-04-03
**Status:** Draft

## Problem

VMware DRS (Distributed Resource Scheduler) automatically balances VM workloads across ESXi hosts. It monitors CPU and memory utilization, detects imbalances, and either recommends or automatically performs vMotion migrations to optimize resource usage.

KubeVirt has `EvictionStrategy` and the Kubernetes scheduler handles initial placement, but there is no equivalent to DRS for ongoing rebalancing. Administrators have no visibility into cluster balance and no guidance on when to migrate VMs. They must manually monitor node utilization and decide which VMs to move.

## Solution

An **Intelligent Placement** feature that provides:

1. **Cluster Balance Dashboard** — Heatmap and metrics showing per-node resource utilization, imbalance score, and trend
2. **Placement Recommendations** — Suggested live migrations to improve cluster balance, with estimated impact
3. **One-Click Rebalance** — Execute recommended migrations with a single click (admin approval required)
4. **Placement Policies** — Configurable rules for VM affinity, anti-affinity, and node preferences (beyond Kubernetes scheduler defaults)
5. **Capacity Forecasting** — Trend-based prediction of when the cluster will run out of resources

This is explicitly **not** automatic DRS. VMware admins migrating to KubeVirt prefer to review and approve recommendations rather than having VMs move automatically. The system recommends; the admin decides.

## Key Decisions

- **Recommendations, not automation** — No automatic migrations. Every recommendation requires admin approval. This matches what most enterprises configure in DRS anyway (manual mode).
- **Prometheus as the data source** — All metrics come from the existing Prometheus integration. No new data collection needed.
- **Simple scoring algorithm** — Balance score based on standard deviation of node utilization. Not machine learning — simple, explainable, auditable math.
- **Live migration only** — Recommendations only suggest live migration for running VMs. No cold migration (stop/start on another node).
- **Respect existing constraints** — Recommendations honor node selectors, tolerations, affinity rules, and taints already on VMs and nodes.
- **No new CRD** — Recommendations are ephemeral (computed on-demand) and stored in-memory. No persistence needed.

## Cluster Balance Dashboard

### Balance Overview

```
┌─── Cluster Balance ──────────────────────────────────────────────┐
│                                                                   │
│  Balance Score: 78/100  (Good)        Imbalance: 22%             │
│  ████████████████████████████████████████████████░░░░░░░░░░░░    │
│                                                                   │
│  Most loaded:   worker-03 (87% memory)                           │
│  Least loaded:  worker-01 (42% memory)                           │
│  Recommendations: 3 migrations suggested                         │
└──────────────────────────────────────────────────────────────────┘
```

### Node Heatmap

Visual representation of all nodes with color-coded utilization:

```
┌─── Node Utilization Heatmap ─────────────────────────────────────┐
│                                                                   │
│  CPU                          Memory                             │
│  ┌────────┐ ┌────────┐       ┌────────┐ ┌────────┐              │
│  │worker-1│ │worker-2│       │worker-1│ │worker-2│              │
│  │  35%   │ │  62%   │       │  42%   │ │  71%   │              │
│  │ ░░░░░░ │ │ ██████ │       │ ████░░ │ │ ██████ │              │
│  └────────┘ └────────┘       └────────┘ └────────┘              │
│  ┌────────┐ ┌────────┐       ┌────────┐ ┌────────┐              │
│  │worker-3│ │worker-4│       │worker-3│ │worker-4│              │
│  │  78%   │ │  45%   │       │  87%   │ │  38%   │              │
│  │ ██████ │ │ ████░░ │       │ ██████ │ │ ███░░░ │              │
│  └────────┘ └────────┘       └────────┘ └────────┘              │
│                                                                   │
│  Color scale:  ░ 0-40%  █ 40-70%  █ 70-85%  █ 85-100%          │
│                  green    blue      orange     red                │
└──────────────────────────────────────────────────────────────────┘
```

Each node cell is clickable → navigates to node detail page.

### Per-Node Detail Strip

Below the heatmap, a sortable table:

```
┌───────────┬──────┬────────┬──────┬────────┬──────┬──────────────┐
│ Node      │ VMs  │ CPU %  │ CPU  │ Mem %  │ Mem  │ Status       │
│───────────┼──────┼────────┼──────┼────────┼──────┼──────────────│
│ worker-03 │ 12   │ 78%    │ 25/32│ 87%    │ 56/64│ ⚠ Overloaded│
│ worker-02 │ 8    │ 62%    │ 20/32│ 71%    │ 45/64│ Normal       │
│ worker-04 │ 6    │ 45%    │ 14/32│ 38%    │ 24/64│ Normal       │
│ worker-01 │ 5    │ 35%    │ 11/32│ 42%    │ 27/64│ Underloaded  │
└───────────┴──────┴────────┴──────┴────────┴──────┴──────────────┘
```

## Balance Scoring Algorithm

### Imbalance Score

The imbalance score measures how unevenly resources are distributed. It uses the **coefficient of variation** (CV) of node utilization:

```python
import numpy as np

def calculate_balance_score(node_utilizations: list[NodeUtilization]) -> BalanceScore:
    """
    Calculate cluster balance score.
    Returns 0-100 where 100 = perfectly balanced.
    """
    # Separate CPU and memory utilization percentages
    cpu_pcts = [n.cpu_used / n.cpu_total * 100 for n in node_utilizations]
    mem_pcts = [n.mem_used / n.mem_total * 100 for n in node_utilizations]

    # Coefficient of variation (std / mean)
    # Lower CV = more balanced
    cpu_cv = np.std(cpu_pcts) / np.mean(cpu_pcts) if np.mean(cpu_pcts) > 0 else 0
    mem_cv = np.std(mem_pcts) / np.mean(mem_pcts) if np.mean(mem_pcts) > 0 else 0

    # Weight memory more heavily (memory is usually the bottleneck for VMs)
    weighted_cv = 0.4 * cpu_cv + 0.6 * mem_cv

    # Convert to 0-100 score (CV of 0 = score 100, CV of 1+ = score 0)
    score = max(0, min(100, int((1 - weighted_cv) * 100)))

    # Imbalance percentage
    imbalance = max(cpu_pcts) - min(cpu_pcts)

    # Status thresholds
    if score >= 80:
        status = "excellent"
    elif score >= 60:
        status = "good"
    elif score >= 40:
        status = "fair"
    else:
        status = "poor"

    return BalanceScore(
        score=score,
        status=status,
        imbalance_pct=round(imbalance, 1),
        cpu_cv=round(cpu_cv, 3),
        mem_cv=round(mem_cv, 3),
        most_loaded_node=max(node_utilizations, key=lambda n: n.mem_pct).name,
        least_loaded_node=min(node_utilizations, key=lambda n: n.mem_pct).name,
    )
```

### Status Thresholds

| Score | Status | Color | Description |
|---|---|---|---|
| 80-100 | Excellent | Green | Cluster is well balanced |
| 60-79 | Good | Blue | Minor imbalance, no action needed |
| 40-59 | Fair | Orange | Noticeable imbalance, recommendations available |
| 0-39 | Poor | Red | Significant imbalance, migration recommended |

## Placement Recommendations

### Recommendation Engine

The engine generates migration suggestions to improve the balance score:

```python
def generate_recommendations(
    nodes: list[NodeUtilization],
    vms: list[VMInfo],
    max_recommendations: int = 5,
) -> list[Recommendation]:
    """
    Generate VM migration recommendations to improve cluster balance.
    Uses a greedy approach: find the migration that most reduces imbalance.
    """
    current_score = calculate_balance_score(nodes)
    if current_score.score >= 80:
        return []  # Already well balanced

    recommendations = []
    # Work with a copy to simulate migrations
    simulated_nodes = deepcopy(nodes)

    for _ in range(max_recommendations):
        best_migration = None
        best_score_improvement = 0

        # Find the most overloaded and most underloaded nodes
        overloaded = sorted(simulated_nodes, key=lambda n: n.mem_pct, reverse=True)
        underloaded = sorted(simulated_nodes, key=lambda n: n.mem_pct)

        for source_node in overloaded[:3]:  # Top 3 most loaded
            # Get VMs on this node that can be migrated
            migratable_vms = [
                vm for vm in vms
                if vm.node == source_node.name
                and vm.status == "Running"
                and vm.live_migratable  # respects EvictionStrategy
            ]

            for vm in migratable_vms:
                for target_node in underloaded[:3]:  # Top 3 least loaded
                    if target_node.name == source_node.name:
                        continue

                    # Check if target has capacity
                    if not has_capacity(target_node, vm):
                        continue

                    # Check if VM's constraints allow this node
                    if not satisfies_constraints(vm, target_node):
                        continue

                    # Simulate the migration and calculate new score
                    simulated = simulate_migration(
                        simulated_nodes, vm, source_node, target_node
                    )
                    new_score = calculate_balance_score(simulated)
                    improvement = new_score.score - current_score.score

                    if improvement > best_score_improvement:
                        best_score_improvement = improvement
                        best_migration = Recommendation(
                            vm_name=vm.name,
                            vm_namespace=vm.namespace,
                            source_node=source_node.name,
                            target_node=target_node.name,
                            reason=_build_reason(source_node, target_node, vm),
                            impact=RecommendationImpact(
                                score_before=current_score.score,
                                score_after=new_score.score,
                                source_node_mem_before=source_node.mem_pct,
                                source_node_mem_after=_new_pct(source_node, vm, "remove"),
                                target_node_mem_before=target_node.mem_pct,
                                target_node_mem_after=_new_pct(target_node, vm, "add"),
                            ),
                        )

        if best_migration and best_score_improvement >= 2:
            recommendations.append(best_migration)
            # Apply migration to simulation for next iteration
            simulated_nodes = simulate_migration(
                simulated_nodes,
                best_migration.vm_name,
                best_migration.source_node,
                best_migration.target_node,
            )
            current_score = calculate_balance_score(simulated_nodes)
        else:
            break  # No more beneficial migrations

    return recommendations


def satisfies_constraints(vm: VMInfo, target_node: NodeInfo) -> bool:
    """Check if a VM can be placed on a target node given its constraints."""
    # Check node selector
    if vm.node_selector:
        for key, value in vm.node_selector.items():
            if target_node.labels.get(key) != value:
                return False

    # Check tolerations vs taints
    for taint in target_node.taints:
        if not any(toleration_matches(t, taint) for t in vm.tolerations):
            return False

    # Check anti-affinity (don't place two VMs from same group on same node)
    if vm.anti_affinity_labels:
        for existing_vm in target_node.vms:
            if shares_labels(existing_vm, vm.anti_affinity_labels):
                return False

    return True
```

### Recommendation Display

```
┌─── Recommendations (3) ─────────────────────────────────────────┐
│                                                                  │
│ Applying all recommendations would improve balance:              │
│ Score: 56 → 82  (+26 points)                                    │
│                                                                  │
│ ┌─ Recommendation 1 ──────────────────────────────────────────┐ │
│ │                                                              │ │
│ │ Migrate: db-replica-02 (production)                         │ │
│ │ From:    worker-03 (87% mem → 72% mem)                      │ │
│ │ To:      worker-01 (42% mem → 57% mem)                      │ │
│ │                                                              │ │
│ │ Reason: worker-03 memory utilization is 87% (above 80%      │ │
│ │         threshold). Moving db-replica-02 (8 GB) to          │ │
│ │         worker-01 (42% utilized) would reduce the           │ │
│ │         imbalance from 45% to 30%.                          │ │
│ │                                                              │ │
│ │ Impact: Balance score +9 points (56 → 65)                   │ │
│ │                                                              │ │
│ │ [Apply Migration]  [Dismiss]                                │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Recommendation 2 ──────────────────────────────────────────┐ │
│ │ Migrate: api-worker-05 (production)                         │ │
│ │ From:    worker-03 (72% mem → 63% mem)                      │ │
│ │ To:      worker-04 (38% mem → 47% mem)                      │ │
│ │ Impact: Balance score +8 points (65 → 73)                   │ │
│ │ [Apply Migration]  [Dismiss]                                │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Recommendation 3 ──────────────────────────────────────────┐ │
│ │ Migrate: cache-redis-01 (staging)                           │ │
│ │ From:    worker-02 (71% mem → 63% mem)                      │ │
│ │ To:      worker-01 (57% mem → 65% mem)                      │ │
│ │ Impact: Balance score +9 points (73 → 82)                   │ │
│ │ [Apply Migration]  [Dismiss]                                │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Apply All Recommendations]                                      │
└──────────────────────────────────────────────────────────────────┘
```

**"Apply Migration"** triggers a `VirtualMachineInstanceMigration` (using the existing migration API). Progress is shown inline:

```
│ ┌─ Recommendation 1 ──────────────────────────────────────────┐ │
│ │ Migrate: db-replica-02 (production)                         │ │
│ │ Status:  ████████████████████░░░░░  75% — Migrating        │ │
│ └──────────────────────────────────────────────────────────────┘ │
```

## Capacity Forecasting

### Trend Analysis

Using the existing metrics endpoint data, predict when the cluster will exhaust resources:

```python
def forecast_capacity(
    historical_metrics: list[TimeSeriesPoint],
    total_capacity: float,
    forecast_days: int = 30,
) -> CapacityForecast:
    """
    Linear regression on historical utilization to predict
    when capacity will be exhausted.
    """
    if len(historical_metrics) < 7:
        return CapacityForecast(confidence="low", message="Need at least 7 days of data")

    # Simple linear regression
    x = np.array([p.timestamp for p in historical_metrics])
    y = np.array([p.value for p in historical_metrics])

    # Normalize x to days from start
    x_days = (x - x[0]) / 86400

    slope, intercept = np.polyfit(x_days, y, 1)

    if slope <= 0:
        return CapacityForecast(
            days_until_full=None,
            trend="decreasing",
            message="Resource usage is decreasing or stable",
        )

    # Days until reaching capacity threshold (85%)
    threshold = total_capacity * 0.85
    current = y[-1]
    if current >= threshold:
        return CapacityForecast(
            days_until_full=0,
            trend="critical",
            message="Cluster is already above 85% threshold",
        )

    days_until_threshold = (threshold - current) / slope

    return CapacityForecast(
        days_until_full=int(days_until_threshold),
        trend="increasing",
        growth_rate_per_day=round(slope, 2),
        current_usage_pct=round(current / total_capacity * 100, 1),
        message=f"At current growth rate, cluster will reach 85% capacity in {int(days_until_threshold)} days",
    )
```

### Forecast Display

```
┌─── Capacity Forecast ───────────────────────────────────────────┐
│                                                                  │
│  Memory                                                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │      ╱                               · · · · ·            │  │
│  │    ╱                           · · ·                85%    │  │
│  │  ╱                       · ·  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │  │
│  │╱                   · ·                                     │  │
│  │              · ·                                           │  │
│  │        · ·                                                 │  │
│  │  · ·                                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│    -30d        -20d        -10d        today    +10d    +20d     │
│                                                                  │
│  ⚠ At current growth rate (+1.2 GB/day), cluster memory will   │
│    reach 85% capacity in ~23 days.                              │
│                                                                  │
│  CPU                                                            │
│  Current: 55% │ Trend: +0.3 cores/day │ Forecast: >60 days      │
│                                                                  │
│  Storage                                                        │
│  Current: 64% │ Trend: +2.1 GB/day │ Forecast: ~45 days         │
└──────────────────────────────────────────────────────────────────┘
```

### Rightsizing Suggestions

Identify VMs that are over-provisioned (allocated much more than they use):

```
┌─── Rightsizing Suggestions ──────────────────────────────────────┐
│                                                                   │
│ These VMs are using significantly less resources than allocated:  │
│                                                                   │
│ VM                │ Allocated  │ Avg Usage │ Suggestion           │
│───────────────────┼────────────┼───────────┼──────────────────────│
│ db-staging-01     │ 8 vCPU     │ 1.2 vCPU  │ Reduce to 2 vCPU   │
│                   │ 16 GB RAM  │ 3.1 GB    │ Reduce to 4 GB     │
│ app-test-03       │ 4 vCPU     │ 0.3 vCPU  │ Reduce to 1 vCPU   │
│                   │ 8 GB RAM   │ 1.8 GB    │ Reduce to 2 GB     │
│ web-legacy-01     │ 4 vCPU     │ 0.1 vCPU  │ Reduce to 1 vCPU   │
│                   │ 4 GB RAM   │ 0.5 GB    │ Reduce to 1 GB     │
│                                                                   │
│ Potential savings: 13 vCPU, 29 GB RAM                            │
│                                                                   │
│ Note: Based on 7-day average utilization. Review peak usage      │
│ before resizing.                                                 │
└──────────────────────────────────────────────────────────────────┘
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/clusters/{cluster}/placement/balance` | Get cluster balance score and per-node utilization |
| `GET` | `/api/v1/clusters/{cluster}/placement/recommendations` | Get migration recommendations |
| `POST` | `/api/v1/clusters/{cluster}/placement/recommendations/{id}/apply` | Execute a recommended migration |
| `POST` | `/api/v1/clusters/{cluster}/placement/recommendations/apply-all` | Execute all recommendations sequentially |
| `POST` | `/api/v1/clusters/{cluster}/placement/recommendations/{id}/dismiss` | Dismiss a recommendation |
| `GET` | `/api/v1/clusters/{cluster}/placement/forecast` | Get capacity forecast (CPU, memory, storage) |
| `GET` | `/api/v1/clusters/{cluster}/placement/rightsizing` | Get rightsizing suggestions |

### Balance Response

```json
{
  "score": 56,
  "status": "fair",
  "imbalance_pct": 45.0,
  "recommendation_count": 3,
  "nodes": [
    {
      "name": "worker-01",
      "cpu_total": 32,
      "cpu_used": 11.2,
      "cpu_pct": 35.0,
      "mem_total_gb": 64,
      "mem_used_gb": 26.9,
      "mem_pct": 42.0,
      "vm_count": 5,
      "status": "underloaded"
    },
    {
      "name": "worker-03",
      "cpu_total": 32,
      "cpu_used": 24.9,
      "cpu_pct": 78.0,
      "mem_total_gb": 64,
      "mem_used_gb": 55.7,
      "mem_pct": 87.0,
      "vm_count": 12,
      "status": "overloaded"
    }
  ]
}
```

## Backend Architecture

### New Files

| File | Purpose |
|---|---|
| `backend/app/models/placement.py` | Pydantic models: `BalanceScore`, `NodeUtilization`, `Recommendation`, `CapacityForecast`, `RightsizingSuggestion` |
| `backend/app/services/placement_service.py` | Balance calculation, recommendation engine, forecasting |
| `backend/app/api/routes/placement.py` | REST endpoints for placement features |

### Frontend Files

| File | Purpose |
|---|---|
| `frontend/src/pages/PlacementPage.tsx` | Cluster balance dashboard with all sections |
| `frontend/src/components/placement/BalanceOverview.tsx` | Score card and summary |
| `frontend/src/components/placement/NodeHeatmap.tsx` | Node utilization heatmap grid |
| `frontend/src/components/placement/RecommendationCard.tsx` | Single recommendation with apply/dismiss |
| `frontend/src/components/placement/RecommendationList.tsx` | List of recommendations |
| `frontend/src/components/placement/ForecastChart.tsx` | Capacity trend chart with projection |
| `frontend/src/components/placement/RightsizingTable.tsx` | Over-provisioned VM table |
| `frontend/src/hooks/usePlacement.ts` | React Query hooks for placement API |

### Navigation

New item under "Monitoring" section:

```
Monitoring
  ├── Cluster Metrics
  ├── Placement & Balance    (scale icon)  ← NEW
  ├── Analytics
  ├── Events
  └── Audit Log
```

## Configuration

```python
# config.py additions
class Settings(BaseSettings):
    # Placement thresholds
    kubevmui_placement_overload_threshold: int = 80     # % — node is "overloaded" above this
    kubevmui_placement_underload_threshold: int = 30    # % — node is "underloaded" below this
    kubevmui_placement_min_improvement: int = 2         # points — minimum score improvement to suggest migration
    kubevmui_placement_max_recommendations: int = 5     # max recommendations per evaluation
    kubevmui_placement_forecast_days: int = 30          # days to look ahead in forecast
    kubevmui_placement_rightsizing_ratio: float = 0.3   # suggest resize if avg usage < 30% of allocated
    kubevmui_placement_rightsizing_min_days: int = 7    # minimum days of data for rightsizing suggestion
```

## Out of Scope (Future)

- **Automatic DRS mode** — Execute recommendations automatically without admin approval. Requires a controller loop and a confidence threshold.
- **Storage DRS** — Balance storage utilization across storage classes / PVs. Requires volume migration (not widely supported in KubeVirt).
- **VM-to-VM affinity/anti-affinity rules** — Custom CRD for placement constraints beyond K8s pod affinity. Useful for HA (don't place both DB replicas on the same node).
- **Predictive placement** — Use historical patterns (time-of-day, day-of-week) to predict future load and pre-emptively migrate. Requires more sophisticated ML models.
- **Cost-aware placement** — When running on cloud with mixed node types (spot vs on-demand), prefer placing non-critical VMs on cheaper nodes.
- **Maintenance mode** — Mark a node for maintenance, automatically generate recommendations to drain its VMs to other nodes. Similar to vSphere maintenance mode.
- **Node scaling recommendations** — "You need 2 more nodes of this size" based on capacity forecast. Integrates with cluster autoscaler.
