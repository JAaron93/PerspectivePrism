import pytest
from unittest.mock import MagicMock
from app.utils.llm_utils import get_validated_api_key


def test_get_validated_api_key_gemini_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    mock_settings = MagicMock()
    mock_settings.GEMINI_API_KEY = "test_gemini_key"
    mock_settings.LLM_API_KEY = ""

    key = get_validated_api_key(mock_settings)
    assert key == "test_gemini_key"


def test_get_validated_api_key_llm_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    mock_settings = MagicMock()
    mock_settings.GEMINI_API_KEY = ""
    mock_settings.LLM_API_KEY = "test_llm_key"

    key = get_validated_api_key(mock_settings)
    assert key == "test_llm_key"


def test_get_validated_api_key_missing(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    mock_settings = MagicMock()
    mock_settings.GEMINI_API_KEY = ""
    mock_settings.LLM_API_KEY = ""

    with pytest.raises(ValueError, match="LLM_API_KEY is not configured"):
        get_validated_api_key(mock_settings)
