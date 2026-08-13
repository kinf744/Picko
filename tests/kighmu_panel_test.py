import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "kighmu-panel.py"
SPEC = importlib.util.spec_from_file_location("kighmu_panel", MODULE_PATH)
assert SPEC and SPEC.loader
PANEL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PANEL)


class KighmuPanelConfigTest(unittest.TestCase):
    def test_replaces_password_auth_with_userpass(self):
        original = """listen: :25000\nauth:\n  type: password\n  password: 'old-secret'\nquic:\n  maxIdleTimeout: 30s\n"""
        users = {"alice": {"password": "one"}, "bob": {"password": "two"}}
        updated = PANEL.replace_auth_block(original, users)
        self.assertIn("type: userpass", updated)
        self.assertIn('"alice": "one"', updated)
        self.assertIn('"bob": "two"', updated)
        self.assertIn("quic:\n  maxIdleTimeout: 30s", updated)
        self.assertNotIn("old-secret", updated)

    def test_session_key_is_deterministic_and_non_raw(self):
        PANEL.SESSION_SECRET = "test-secret"
        token = "example-token"
        self.assertEqual(PANEL.session_key(token), PANEL.session_key(token))
        self.assertNotEqual(token, PANEL.session_key(token))


if __name__ == "__main__":
    unittest.main()
