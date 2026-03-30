from unittest.mock import MagicMock

from app.models.network_cr import NetworkCRCreate, NetworkCRUpdate
from app.services.network_cr_service import (
    NetworkCRService,
    _build_cni_config,
    _build_cr_body,
    _cr_from_raw,
)


def _raw_pod_network():
    return {
        "metadata": {"name": "pod-network", "creationTimestamp": "2026-01-01T00:00:00Z"},
        "spec": {
            "displayName": "Pod Network (default)",
            "description": "Default pod network",
            "networkType": "pod",
            "interfaceType": "masquerade",
        },
    }


def _raw_bridge_network():
    return {
        "metadata": {"name": "prod-vlan100", "creationTimestamp": "2026-01-01T00:00:00Z"},
        "spec": {
            "displayName": "Production VLAN 100",
            "description": "Prod network",
            "networkType": "multus",
            "interfaceType": "bridge",
            "bridgeName": "br-prod",
            "vlanId": 100,
            "dhcpEnabled": True,
            "cniConfig": '{"cniVersion":"0.3.1","name":"prod-vlan100","type":"bridge","bridge":"br-prod","vlan":100,"ipam":{"type":"dhcp"}}',
        },
    }


class TestCrFromRaw:
    def test_pod_network(self):
        cr = _cr_from_raw(_raw_pod_network())
        assert cr.name == "pod-network"
        assert cr.network_type == "pod"
        assert cr.interface_type == "masquerade"
        assert cr.display_name == "Pod Network (default)"

    def test_bridge_network(self):
        cr = _cr_from_raw(_raw_bridge_network())
        assert cr.name == "prod-vlan100"
        assert cr.network_type == "multus"
        assert cr.interface_type == "bridge"
        assert cr.bridge_name == "br-prod"
        assert cr.vlan_id == 100
        assert cr.cni_config is not None


class TestBuildCniConfig:
    def test_bridge_with_vlan_and_dhcp(self):
        req = NetworkCRCreate(
            name="test",
            display_name="Test",
            bridge_name="br0",
            vlan_id=100,
            dhcp_enabled=True,
        )
        config = _build_cni_config(req)
        import json

        parsed = json.loads(config)
        assert parsed["type"] == "bridge"
        assert parsed["bridge"] == "br0"
        assert parsed["vlan"] == 100
        assert parsed["ipam"] == {"type": "dhcp"}

    def test_bridge_no_dhcp(self):
        req = NetworkCRCreate(
            name="test",
            display_name="Test",
            bridge_name="br0",
            dhcp_enabled=False,
        )
        config = _build_cni_config(req)
        import json

        parsed = json.loads(config)
        assert "ipam" not in parsed


class TestBuildCrBody:
    def test_pod_network(self):
        req = NetworkCRCreate(name="pod-network", display_name="Pod", network_type="pod")
        body = _build_cr_body(req)
        assert body["spec"]["networkType"] == "pod"
        assert body["spec"]["interfaceType"] == "masquerade"
        assert "cniConfig" not in body["spec"]

    def test_multus_auto_generates_cni(self):
        req = NetworkCRCreate(
            name="test-bridge",
            display_name="Test Bridge",
            network_type="multus",
            bridge_name="br0",
        )
        body = _build_cr_body(req)
        assert body["spec"]["networkType"] == "multus"
        assert body["spec"]["interfaceType"] == "bridge"
        assert "cniConfig" in body["spec"]

    def test_multus_preserves_custom_cni(self):
        custom = '{"custom": true}'
        req = NetworkCRCreate(
            name="custom",
            display_name="Custom",
            network_type="multus",
            cni_config=custom,
        )
        body = _build_cr_body(req)
        assert body["spec"]["cniConfig"] == custom


class TestNetworkCRService:
    def _make_svc(self):
        kv = MagicMock()
        return NetworkCRService(kv), kv

    def test_list_networks(self):
        svc, kv = self._make_svc()
        kv.list_network_crs.return_value = [_raw_pod_network(), _raw_bridge_network()]
        result = svc.list_networks()
        assert len(result) == 2
        assert result[0].name == "pod-network"
        assert result[1].name == "prod-vlan100"

    def test_get_network_found(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = _raw_pod_network()
        result = svc.get_network("pod-network")
        assert result is not None
        assert result.name == "pod-network"

    def test_get_network_not_found(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = None
        result = svc.get_network("nonexistent")
        assert result is None

    def test_ensure_nad_pod_returns_none(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = _raw_pod_network()
        result = svc.ensure_nad("default", "pod-network")
        assert result is None
        kv.create_nad.assert_not_called()

    def test_ensure_nad_creates_when_missing(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = _raw_bridge_network()
        kv.list_nads_by_label.return_value = []
        kv.create_nad.return_value = {"metadata": {"name": "prod-vlan100"}}
        result = svc.ensure_nad("my-ns", "prod-vlan100")
        assert result == "prod-vlan100"
        kv.create_nad.assert_called_once()
        call_args = kv.create_nad.call_args
        assert call_args[0][0] == "my-ns"
        body = call_args[0][1]
        assert body["metadata"]["labels"]["networks.kubevmui.io/source"] == "prod-vlan100"

    def test_ensure_nad_skips_when_exists(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = _raw_bridge_network()
        kv.list_nads_by_label.return_value = [{"metadata": {"name": "prod-vlan100"}}]
        result = svc.ensure_nad("my-ns", "prod-vlan100")
        assert result == "prod-vlan100"
        kv.create_nad.assert_not_called()

    def test_seed_pod_network_creates_when_missing(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = None
        kv.create_network_cr.return_value = _raw_pod_network()
        result = svc.seed_pod_network()
        assert result is True
        kv.create_network_cr.assert_called_once()

    def test_seed_pod_network_skips_when_exists(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = _raw_pod_network()
        result = svc.seed_pod_network()
        assert result is False
        kv.create_network_cr.assert_not_called()

    def test_delete_cleans_up_nads(self):
        svc, kv = self._make_svc()
        kv.list_all_nads_by_label.return_value = [
            {"metadata": {"name": "prod-vlan100", "namespace": "ns1"}},
            {"metadata": {"name": "prod-vlan100", "namespace": "ns2"}},
        ]
        svc.delete_network("prod-vlan100")
        assert kv.delete_nad.call_count == 2
        kv.delete_network_cr.assert_called_once_with("prod-vlan100")

    def test_update_network(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = _raw_bridge_network()
        kv.patch_network_cr.return_value = {
            **_raw_bridge_network(),
            "spec": {**_raw_bridge_network()["spec"], "displayName": "Updated"},
        }
        result = svc.update_network("prod-vlan100", NetworkCRUpdate(display_name="Updated"))
        assert result.display_name == "Updated"
        kv.patch_network_cr.assert_called_once()
