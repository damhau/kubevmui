# kubevmui — K8s-Native Backup Architecture

A detailed backup and disaster recovery architecture for KubeVirt VMs, built entirely on Kubernetes-native primitives.

## 1. Overview

The backup system provides VM-level and namespace-level backup/restore capabilities using Kubernetes CRDs as the control plane. It supports two storage backends (NFS and S3-compatible object storage) and integrates with KubeVirt's existing snapshot infrastructure for crash-consistent and application-consistent backups.

### Design Principles

- **CRD-driven**: All backup state (targets, schedules, policies, backup records) is stored as Kubernetes Custom Resources — no external database
- **Controller pattern**: A Kubernetes controller reconciles backup CRDs, ensuring backups happen even if kubevmui is down
- **KubeVirt-native**: Leverages `VirtualMachineSnapshot` and `VirtualMachineRestore` as the foundation, extending them with external storage export
- **Declarative scheduling**: Backup schedules are CRDs with cron expressions, not application-level timers
- **Multi-cluster aware**: Backups stored externally can be restored to any registered cluster

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        kubevmui UI                               │
│  Backup Targets │ On-Demand Backup │ Schedules │ Restore │ List │
└────────┬─────────────────┬───────────────┬───────────────────────┘
         │ REST API         │               │
┌────────▼─────────────────▼───────────────▼───────────────────────┐
│                    kubevmui Backend (FastAPI)                     │
│  backup_service.py — CRUD for backup CRDs, status aggregation    │
└────────┬─────────────────────────────────────────────────────────┘
         │ creates/watches CRDs
┌────────▼─────────────────────────────────────────────────────────┐
│              Kubernetes API Server                                │
│                                                                   │
│  CRDs:                                                           │
│  ├── VMBackupTarget        (where to store backups)              │
│  ├── VMBackup              (single backup record)                │
│  ├── VMBackupSchedule      (cron-based recurring backup)         │
│  ├── VMRestore             (restore operation)                   │
│  └── VMBackupPolicy        (retention + lifecycle rules)         │
│                                                                   │
│  Existing KubeVirt CRDs:                                         │
│  ├── VirtualMachineSnapshot                                      │
│  └── VirtualMachineRestore                                       │
└────────┬─────────────────────────────────────────────────────────┘
         │ reconciles
┌────────▼─────────────────────────────────────────────────────────┐
│              Backup Controller (Deployment)                       │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐      │
│  │  Snapshot    │  │   Export     │  │   Schedule         │      │
│  │  Manager    │  │   Manager    │  │   Manager          │      │
│  │             │  │              │  │                    │      │
│  │ Creates VM  │  │ Reads snap   │  │ Watches Schedule   │      │
│  │ snapshots   │  │ content,     │  │ CRDs, creates      │      │
│  │ via KubeVirt│  │ streams to   │  │ VMBackup at cron   │      │
│  │ snapshot API│  │ target       │  │ intervals           │      │
│  └──────┬──────┘  └──────┬───────┘  └────────┬───────────┘      │
│         │                │                    │                   │
│  ┌──────▼────────────────▼────────────────────▼───────────────┐  │
│  │                  Retention Manager                          │  │
│  │  Enforces VMBackupPolicy: max count, max age, pruning      │  │
│  └────────────────────────┬───────────────────────────────────┘  │
└───────────────────────────┼──────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
      ┌───────▼───────┐          ┌────────▼────────┐
      │   NFS Target  │          │   S3 Target     │
      │               │          │                 │
      │ /backups/     │          │ bucket/         │
      │  ├── vm-a/    │          │  ├── vm-a/      │
      │  │  ├── meta/ │          │  │  ├── meta/   │
      │  │  └── data/ │          │  │  └── data/   │
      │  └── vm-b/    │          │  └── vm-b/      │
      └───────────────┘          └─────────────────┘
```

## 3. Custom Resource Definitions

### 3.1 VMBackupTarget

Defines where backups are stored. Referenced by backups and schedules.

```yaml
apiVersion: kubevmui.io/v1alpha1
kind: VMBackupTarget
metadata:
  name: s3-production
  namespace: kubevmui-system
spec:
  type: s3                          # s3 | nfs
  default: true                     # one target can be the default
  s3:
    endpoint: https://minio.example.com
    bucket: vm-backups
    region: us-east-1
    credentialsSecretRef:
      name: s3-backup-creds         # Secret with access-key + secret-key
    prefix: production/             # optional path prefix
    insecureSkipTLSVerify: false
  # --- OR for NFS ---
  # nfs:
  #   server: 10.0.0.50
  #   path: /exports/vm-backups
  #   mountOptions: ["nfsvers=4.1", "hard"]
status:
  ready: true
  lastValidated: "2026-03-29T10:00:00Z"
  message: "Connection verified, bucket accessible"
```

### 3.2 VMBackup

Represents a single point-in-time backup of one VM.

```yaml
apiVersion: kubevmui.io/v1alpha1
kind: VMBackup
metadata:
  name: myvm-backup-20260329-100000
  namespace: production
  labels:
    kubevmui.io/vm-name: myvm
    kubevmui.io/schedule: daily-production    # set if created by a schedule
  ownerReferences:                             # owned by schedule for GC
    - apiVersion: kubevmui.io/v1alpha1
      kind: VMBackupSchedule
      name: daily-production
spec:
  source:
    kind: VirtualMachine
    name: myvm
    namespace: production
  targetRef:
    name: s3-production
    namespace: kubevmui-system
  quiesce: true                     # request guest agent filesystem freeze
  includedVolumes:                  # optional: subset of volumes (default: all)
    - rootdisk
    - datadisk
status:
  phase: Completed                  # Pending | SnapshotInProgress | Exporting | Completed | Failed
  snapshotName: myvm-snap-backup-20260329
  startTime: "2026-03-29T10:00:00Z"
  completionTime: "2026-03-29T10:03:22Z"
  expirationTime: "2026-04-28T10:00:00Z"    # set by retention policy
  totalBytes: 10737418240                     # 10 GiB
  progress: 100
  contents:
    - volumeName: rootdisk
      pvcName: myvm-rootdisk
      size: 8Gi
      storagePath: "production/myvm/20260329-100000/rootdisk.img"
    - volumeName: datadisk
      pvcName: myvm-datadisk
      size: 32Gi
      storagePath: "production/myvm/20260329-100000/datadisk.img"
  vmMetadata:                        # VM spec captured at backup time
    cpu: 4
    memory: 8Gi
    runStrategy: RerunOnFailure
    labels:
      app: webserver
  conditions:
    - type: SnapshotReady
      status: "True"
    - type: ExportComplete
      status: "True"
    - type: MetadataStored
      status: "True"
```

### 3.3 VMBackupSchedule

Declares a recurring backup with cron expression and retention.

```yaml
apiVersion: kubevmui.io/v1alpha1
kind: VMBackupSchedule
metadata:
  name: daily-production
  namespace: production
spec:
  schedule: "0 2 * * *"              # daily at 2 AM
  timezone: "Europe/Zurich"
  source:
    kind: VirtualMachine
    name: myvm
    # --- OR select multiple VMs by label ---
    # selector:
    #   matchLabels:
    #     tier: production
  targetRef:
    name: s3-production
    namespace: kubevmui-system
  quiesce: true
  policyRef:
    name: standard-retention
    namespace: kubevmui-system
  maxFailures: 3                      # auto-suspend after N consecutive failures
  suspend: false
status:
  active: true
  lastBackupTime: "2026-03-29T02:00:00Z"
  lastBackupName: myvm-backup-20260329-020000
  lastBackupPhase: Completed
  nextBackupTime: "2026-03-30T02:00:00Z"
  consecutiveFailures: 0
  totalBackups: 27
  conditions:
    - type: Scheduled
      status: "True"
```

### 3.4 VMRestore

Declares a restore operation from a backup.

```yaml
apiVersion: kubevmui.io/v1alpha1
kind: VMRestore
metadata:
  name: restore-myvm-20260329
  namespace: production
spec:
  backupRef:
    name: myvm-backup-20260329-100000
    namespace: production
  target:
    kind: VirtualMachine
    name: myvm                        # replace existing
    # --- OR restore as new VM ---
    # name: myvm-restored
    # createNew: true
  # --- OR cross-cluster restore ---
  # targetCluster: staging-cluster
  # targetNamespace: staging
  volumeRestoreMode: DataVolume       # DataVolume | PVC (DataVolume enables CDI import)
status:
  phase: Completed                    # Pending | Importing | VolumeRestoring | VMRecreating | Completed | Failed
  startTime: "2026-03-29T12:00:00Z"
  completionTime: "2026-03-29T12:05:14Z"
  restoredVM: myvm
  restoredVolumes:
    - volumeName: rootdisk
      pvcName: myvm-rootdisk
      phase: Completed
    - volumeName: datadisk
      pvcName: myvm-datadisk
      phase: Completed
```

### 3.5 VMBackupPolicy

Retention and lifecycle rules, referenced by schedules.

```yaml
apiVersion: kubevmui.io/v1alpha1
kind: VMBackupPolicy
metadata:
  name: standard-retention
  namespace: kubevmui-system
spec:
  retention:
    maxCount: 30                      # keep at most 30 backups per VM
    maxAge: 720h                      # 30 days
    keepDaily: 7                      # keep 1/day for last 7 days
    keepWeekly: 4                     # keep 1/week for last 4 weeks
    keepMonthly: 3                    # keep 1/month for last 3 months
  lifecycle:
    transitionToArchive: 168h         # move to archive tier after 7 days (S3 only)
    archiveStorageClass: GLACIER
  validation:
    enabled: true
    checksumAlgorithm: sha256         # verify integrity on export
```

## 4. Backup Controller

The backup controller runs as a Kubernetes Deployment (separate from kubevmui or embedded as a sidecar). It watches the CRDs above and reconciles them.

### 4.1 Backup Flow (VMBackup reconciliation)

```
VMBackup created (phase: Pending)
    │
    ▼
1. Validate VMBackupTarget is ready
    │
    ▼
2. Create VirtualMachineSnapshot (KubeVirt native)
   ├── If quiesce=true: guest agent freezes filesystem
   └── phase → SnapshotInProgress
    │
    ▼
3. Wait for VirtualMachineSnapshot.status.readyToUse = true
    │
    ▼
4. For each volume in the snapshot:
   ├── Create temporary PVC from snapshot (CSI VolumeSnapshot → PVC)
   ├── Spawn a short-lived export Pod:
   │   ├── Mounts the temporary PVC read-only
   │   ├── Streams data to target (S3 multipart upload / NFS write)
   │   ├── Computes checksum during transfer
   │   └── Reports progress via Pod annotations
   ├── phase → Exporting, progress updated
   └── Clean up temporary PVC when done
    │
    ▼
5. Store VM metadata (spec, labels, annotations, network config)
   as JSON alongside the volume data on the target
    │
    ▼
6. Clean up VirtualMachineSnapshot (configurable: keep or delete)
    │
    ▼
7. phase → Completed (or Failed with error in conditions)
```

### 4.2 Export Pod

The export pod is the workhorse that transfers data to the backup target. It runs as a short-lived Job.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: backup-export-myvm-rootdisk-20260329
  namespace: production
  ownerReferences:
    - kind: VMBackup
      name: myvm-backup-20260329-100000
spec:
  backoffLimit: 2
  activeDeadlineSeconds: 7200        # 2 hour timeout
  template:
    spec:
      serviceAccountName: backup-controller
      containers:
        - name: exporter
          image: kubevmui/backup-exporter:v1
          args:
            - --source=/data/disk.img
            - --target=s3://vm-backups/production/myvm/20260329/rootdisk.img
            - --checksum=sha256
            - --compress=zstd          # optional compression
            - --bandwidth-limit=100M   # optional bandwidth throttling
          volumeMounts:
            - name: source-vol
              mountPath: /data
              readOnly: true
          resources:
            requests:
              memory: 256Mi
              cpu: 500m
            limits:
              memory: 1Gi
              cpu: "2"
      volumes:
        - name: source-vol
          persistentVolumeClaim:
            claimName: snap-myvm-rootdisk-tmp
      restartPolicy: Never
```

### 4.3 Restore Flow (VMRestore reconciliation)

```
VMRestore created (phase: Pending)
    │
    ▼
1. Read backup metadata from target storage
    │
    ▼
2. Validate target cluster has required StorageClasses, NetworkProfiles
    │
    ▼
3. For each volume in the backup:
   ├── Create DataVolume with HTTP/S3 import source pointing at backup data
   │   (leverages CDI — Containerized Data Importer)
   ├── OR spawn import Pod for NFS sources
   ├── phase → Importing, track DV progress
   └── Wait for DataVolume.status.phase = Succeeded
    │
    ▼
4. Recreate or update VirtualMachine from stored metadata
   ├── Apply original spec with volume references updated to new PVCs
   ├── If createNew: generate new name, clear instance-specific fields
   └── phase → VMRecreating
    │
    ▼
5. phase → Completed
```

### 4.4 Schedule Manager

```
VMBackupSchedule reconciliation loop:
    │
    ▼
1. Parse cron expression + timezone
    │
    ▼
2. If currentTime >= nextBackupTime:
   ├── Create VMBackup CR with ownerReference → this schedule
   ├── Set schedule labels on the VMBackup
   └── Update status.lastBackupTime, status.nextBackupTime
    │
    ▼
3. Watch owned VMBackup status:
   ├── On Completed: reset consecutiveFailures, update lastBackupPhase
   └── On Failed: increment consecutiveFailures
       ├── If consecutiveFailures >= maxFailures:
       │   suspend schedule, emit Event + alert
       └── Else: continue
    │
    ▼
4. Run retention sweep:
   ├── List all VMBackups owned by this schedule
   ├── Apply VMBackupPolicy rules (maxCount, maxAge, keepDaily/Weekly/Monthly)
   └── Delete expired VMBackups (controller cleans up target storage)
```

## 5. Storage Layout

### 5.1 S3 Layout

```
s3://vm-backups/
├── {namespace}/
│   └── {vm-name}/
│       └── {timestamp}/
│           ├── metadata.json          # VM spec, labels, network config
│           ├── rootdisk.img.zst       # compressed disk image
│           ├── rootdisk.sha256        # checksum
│           ├── datadisk.img.zst
│           ├── datadisk.sha256
│           └── backup-manifest.json   # volume list, sizes, CRD reference
```

### 5.2 NFS Layout

Same structure mounted at the NFS export path.

```
/exports/vm-backups/
├── production/
│   └── myvm/
│       ├── 20260329-020000/
│       │   ├── metadata.json
│       │   ├── rootdisk.img.zst
│       │   └── ...
│       └── 20260329-100000/
│           └── ...
```

## 6. Integration with kubevmui

### 6.1 Backend API Endpoints

```
# Backup Targets
GET    /api/v1/backup-targets                              # list all targets
POST   /api/v1/backup-targets                              # create target
GET    /api/v1/backup-targets/{name}                       # get target
PUT    /api/v1/backup-targets/{name}                       # update target
DELETE /api/v1/backup-targets/{name}                       # delete target
POST   /api/v1/backup-targets/{name}/validate              # test connectivity

# Backups
GET    /api/v1/clusters/{c}/namespaces/{ns}/backups        # list backups
POST   /api/v1/clusters/{c}/namespaces/{ns}/vms/{vm}/backup  # create backup
GET    /api/v1/clusters/{c}/namespaces/{ns}/backups/{name} # get backup detail
DELETE /api/v1/clusters/{c}/namespaces/{ns}/backups/{name} # delete backup

# Restore
POST   /api/v1/clusters/{c}/namespaces/{ns}/backups/{name}/restore  # restore

# Backup Schedules
GET    /api/v1/clusters/{c}/namespaces/{ns}/backup-schedules
POST   /api/v1/clusters/{c}/namespaces/{ns}/backup-schedules
GET    /api/v1/clusters/{c}/namespaces/{ns}/backup-schedules/{name}
PUT    /api/v1/clusters/{c}/namespaces/{ns}/backup-schedules/{name}
DELETE /api/v1/clusters/{c}/namespaces/{ns}/backup-schedules/{name}
POST   /api/v1/clusters/{c}/namespaces/{ns}/backup-schedules/{name}/suspend
POST   /api/v1/clusters/{c}/namespaces/{ns}/backup-schedules/{name}/resume

# Backup Policies
GET    /api/v1/backup-policies
POST   /api/v1/backup-policies
PUT    /api/v1/backup-policies/{name}
DELETE /api/v1/backup-policies/{name}
```

### 6.2 Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Backup Targets | `/settings/backup-targets` | Configure NFS/S3 targets with connection test |
| Backup List | `/backups` | All backups across VMs, filterable by VM/namespace/status |
| Backup Schedules | `/backup-schedules` | Manage recurring backup schedules |
| VM Backups Tab | `/vms/{ns}/{name}/backups` | Per-VM backup list + create on VM detail page |
| Restore Dialog | Modal | Choose target VM name, namespace, cluster |

### 6.3 VM Detail Integration

The VM detail page gets a **Backups** tab (alongside existing Snapshots tab):

- List of backups for this VM with status, size, date, target
- "Backup Now" button (creates VMBackup CR)
- "Schedule" quick link to create/edit schedule for this VM
- Restore action per backup row (opens restore dialog)
- Delete action with confirmation

### 6.4 Dashboard Integration

The dashboard gains a backup health card:

- Total backups / total size across all targets
- Last 24h: successful / failed backup count
- Schedules: active / suspended count
- Storage utilization per target (used / capacity for NFS, object count for S3)

## 7. Security

| Concern | Approach |
|---------|----------|
| S3 credentials | Stored as Kubernetes Secrets, referenced by VMBackupTarget CR |
| NFS access | Controlled via export rules on the NFS server; backup controller uses a dedicated ServiceAccount |
| RBAC | Backup CRDs gated by K8s RBAC — `kubevmui:backup-admin`, `kubevmui:backup-viewer` ClusterRoles |
| Encryption at rest | S3: SSE-S3 or SSE-KMS configured on the bucket; NFS: recommend encrypted filesystem |
| Encryption in transit | S3: TLS enforced; NFS: recommend NFSv4 + Kerberos |
| Cross-namespace | VMBackupTarget is cluster-scoped or in `kubevmui-system`; backup CRs are namespace-scoped |
| Impersonation | kubevmui backend impersonates the OIDC user when creating backup CRDs (existing auth model) |

## 8. Comparison with Alternatives

| Feature | This Architecture | Velero + OADP | Kasten K10 |
|---------|------------------|---------------|------------|
| K8s-native CRDs | Yes (custom) | Yes | Yes |
| KubeVirt-aware | Yes (VM-level granularity) | Namespace-level only | VM-aware |
| Quiesced snapshots | Yes (guest agent) | No | Yes |
| Scheduled backups | Yes (CRD-based) | Yes | Yes |
| Granular retention | Yes (GFS policy) | TTL only | Yes |
| Cross-cluster restore | Yes | Yes | Yes |
| Multi-target | Yes | Yes | Yes |
| No external dependencies | Yes (self-contained) | Velero server | Full platform |
| UI integration | Native kubevmui | Separate | Separate |
| Open source | Yes | Yes | No |

## 9. Implementation Phases

### Phase 1 — Foundation
- Define CRDs (VMBackupTarget, VMBackup, VMRestore)
- Backup controller with snapshot + S3 export
- kubevmui API endpoints for backup CRUD
- Basic UI: backup list, create, restore

### Phase 2 — Scheduling & Retention
- VMBackupSchedule CRD + schedule manager
- VMBackupPolicy CRD + retention manager
- NFS target support
- UI: schedule management, policy editor

### Phase 3 — Production Hardening
- Compression (zstd) and bandwidth throttling
- Checksum verification on restore
- Cross-cluster restore
- Backup health dashboard card
- Alerting integration (Prometheus metrics + alerts)
- `backup-exporter` container image with multi-arch support

### Phase 4 — Advanced
- Incremental backups (CBT — Changed Block Tracking via CSI)
- Application-consistent hooks (pre/post-backup scripts)
- S3 lifecycle transitions (Standard → Glacier)
- Backup encryption (client-side AES-256 before upload)
- Backup integrity periodic validation CronJob
