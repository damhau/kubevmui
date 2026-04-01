dahsboard
| KubeVirt version display | [ ] | Not shown |
| Alerts | [~] | Shows error VMs and importing images, no K8s alerts integration |



storage
- Backend storage system info (Ceph, TopoLVM, Longhorn)
  - if topolovm add detailed metrics and info
- Disk import from URL/registry (separate from image flow)
- Browser upload for qcow2/raw/ISO
- Volume-level snapshots
- Warning when deleting disk attached to VM
- Storage overview with capacity breakdown per tier
- import vmdk and vhdx
- Disk type: cdrom
- Disk type: lun (SCSI passthrough)
- Disk type: filesystem (virtiofs)
- Disk error policy
- Disk cache modes (none, writeback, writethrough)
- Disk sharing (shareable: true)
- Volume source:
  Ephemeral volumes	❌	Not exposed
  Empty disk	❌	Not exposed
  Host disk	❌	Not exposed
- export:
    VirtualMachineExport CRD	❌	Not implemented
    Export from VM/Snapshot/PVC	❌	Not implemented
    Export download (raw/gzip)	❌	Not implemente

- Volume Migration
    KubeVirt Feature	Status	Notes
    Live storage migration (updateVolumesStrategy: Migration)	❌	Not implemented
    Cross-storage-class migration	❌	Not implemented
    Multi-volume migration	❌	Not implemented
    Migration cancellation via spec revert	❌	Not implemented


- Import vmdk, vhdx, etc...
 

Network:
- support Per-VMI hostname/subdomain DNS records https://kubevirt.io/user-guide/network/dns/
- how to abstract nicely the creation of 
    - ClusterIP Service for VMs
    - NodePort Service for VMs

    

Tempalte:

Convert VM to template" / "Create image from VM disk". Yes, it's absolutely doable with KubeVirt. The approach:                                                                                                                                                                                                                   
                                                                                                                                                                                                                                                                                                                                        
  1. Create image from VM disk — Clone the VM's root PVC into a new Image (DataVolume clone). This gives you a golden image of the.                                                                                                                                                                                                                       
  2. Create template from VM — Extract the VM's spec (CPU, memory, disks, networks, cloud-init) into a Template CRD.        

  
