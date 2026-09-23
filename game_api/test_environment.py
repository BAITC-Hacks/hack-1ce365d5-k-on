import os
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch


SETTINGS_FILE = Path(__file__).resolve().parent.parent / "ThisIsTheAstana" / "settings.py"


class EnvironmentLoadingTests(TestCase):
    def load_settings(self, content=None, environment=None):
        # Execute a copied settings module so tests never read the player's .env.
        with TemporaryDirectory() as directory:
            root = Path(directory)
            module = root / "ThisIsTheAstana" / "settings.py"
            module.parent.mkdir()
            module.write_text(SETTINGS_FILE.read_text(encoding="utf-8"), encoding="utf-8")
            if content is not None:
                (root / ".env").write_text(content, encoding="utf-8")
            with patch.dict(os.environ, environment or {}, clear=True):
                return runpy.run_path(str(module))

    def test_repository_dotenv_configures_providers(self):
        settings = self.load_settings(
            "AKIM_AI_PROVIDER=demo\nGAME_SIMULATION_PROVIDER=local_engine.simulate\n"
        )
        self.assertEqual(settings["AKIM_AI_PROVIDER"], "demo")
        self.assertEqual(settings["GAME_SIMULATION_PROVIDER"], "local_engine.simulate")

    def test_process_environment_wins_including_explicit_empty_values(self):
        settings = self.load_settings(
            "AKIM_AI_PROVIDER=demo\nGAME_SIMULATION_PROVIDER=local_engine.simulate\n",
            {"AKIM_AI_PROVIDER": "", "GAME_SIMULATION_PROVIDER": "deployed_engine.simulate"},
        )
        self.assertEqual(settings["AKIM_AI_PROVIDER"], "")
        self.assertEqual(settings["GAME_SIMULATION_PROVIDER"], "deployed_engine.simulate")

    def test_missing_dotenv_preserves_defaults(self):
        settings = self.load_settings()
        self.assertEqual(settings["AKIM_AI_PROVIDER"], "openai")
        self.assertEqual(settings["GAME_CATALOG_PROVIDER"], "akim_ai.agent.load_catalog")
        self.assertEqual(settings["GAME_SIMULATION_PROVIDER"], "game_api.engine.simulate")

    def test_empty_engine_configuration_uses_built_in_engine(self):
        settings = self.load_settings("GAME_SIMULATION_PROVIDER=\n")
        self.assertEqual(settings["GAME_SIMULATION_PROVIDER"], "game_api.engine.simulate")
