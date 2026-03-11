from __future__ import annotations

from pathlib import Path

import app.config as config_module
import pytest


def test_load_local_env_file_parses_bom_quotes_and_export(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Local .env parser should support BOM, quoted values, and export syntax."""
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\ufeff# comment\n"
        "export TELEGRAM_BOT_TOKEN=\"token-from-env\"\n"
        "EMPTY_VALUE=\n",
        encoding="utf-8",
    )

    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("EMPTY_VALUE", raising=False)

    config_module._load_local_env_file(env_file)

    assert config_module.os.getenv("TELEGRAM_BOT_TOKEN") == "token-from-env"
    assert config_module.os.getenv("EMPTY_VALUE") == ""


def test_settings_prefers_env_token_over_yaml_token(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """When TELEGRAM_BOT_TOKEN exists in .env, it should override YAML token."""
    config_file = tmp_path / "app_config.yaml"
    config_file.write_text(
        "telegram:\n"
        "  enabled: true\n"
        "  bot_token: yaml-token\n",
        encoding="utf-8",
    )

    env_file = tmp_path / ".env"
    env_file.write_text("TELEGRAM_BOT_TOKEN=env-token\n", encoding="utf-8")

    monkeypatch.setattr(config_module, "DEFAULT_APP_CONFIG_PATH", config_file)
    monkeypatch.setattr(config_module, "DEFAULT_ENV_PATH", env_file)
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)

    settings = config_module.Settings.from_yaml()

    assert settings.telegram_bot_token == "env-token"


def test_settings_rejects_invalid_storage_mode(tmp_path: Path, monkeypatch) -> None:
    """Invalid storage.mode value should fail fast with clear validation error."""
    config_file = tmp_path / "app_config.yaml"
    config_file.write_text(
        "storage:\n"
        "  mode: invalid_mode\n",
        encoding="utf-8",
    )

    env_file = tmp_path / ".env"
    env_file.write_text("", encoding="utf-8")

    monkeypatch.setattr(config_module, "DEFAULT_APP_CONFIG_PATH", config_file)
    monkeypatch.setattr(config_module, "DEFAULT_ENV_PATH", env_file)

    with pytest.raises(ValueError, match="Invalid config value"):
        config_module.Settings.from_yaml()
