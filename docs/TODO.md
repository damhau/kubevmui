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

- when we create the template we should be able to edit the disk and the network, currently we cannot add/remove


  
Test snapshot support:;

  Option A: Check VolumeSnapshotClass existence                                                                                                                                                                                                   
  The cleanest signal. If no VolumeSnapshotClass exists for the VM's storage class, snapshots won't work. The backend can query VolumeSnapshotClasses and match their driver against the provisioner of the VM's StorageClass. This is the most
  reliable check.                                                                                                                                                                                                                                 
                                                                                                                                                                                                                                                
  Option B: StorageClass annotations/features                                                                                                                                                                                                     
  Some CSI drivers advertise snapshot support via the StorageClass or CSIDriver object. Less universal — not all drivers do this.
                                                                                                                                                                                                                                                  
  Option C: Try and fail
  Just let the snapshot creation fail and show the error. Simplest but bad UX.                                                                                                                                                                    
                                                                                                                                                                                                                                                  
  I'd recommend Option A:                                                                                                                                                                                                                         
  1. Backend adds an endpoint or enriches storage class data with a supports_snapshots: bool field (by checking if a matching VolumeSnapshotClass exists for that provisioner)                                                                    
  2. Frontend uses this info to disable/hide the snapshot button on the VM detail page when the VM's disks use a storage class that doesn't support snapshots                                                                                     
  3. Could also show a tooltip explaining why it's disabled                                                                                                  
                                                                                                                                                                                                                                                  
  The check is: for a given StorageClass, get its provisioner field, then check if any VolumeSnapshotClass has a matching driver field. If yes → snapshots supported.   