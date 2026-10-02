import os
import pytest
from app.core.config import Settings


def test_cors_origins_single_string():
    settings = Settings(CORS_ORIGINS="http://localhost:3000")
    assert settings.CORS_ORIGINS == ["http://localhost:3000"]


def test_cors_origins_single_production_domain():
    settings = Settings(CORS_ORIGINS="https://food-helper.vercel.app")
    assert settings.CORS_ORIGINS == ["https://food-helper.vercel.app"]


def test_cors_origins_multiple_comma_separated():
    settings = Settings(CORS_ORIGINS="http://localhost:3000, https://food-helper.vercel.app, https://admin.foodrescue.org")
    assert settings.CORS_ORIGINS == [
        "http://localhost:3000",
        "https://food-helper.vercel.app",
        "https://admin.foodrescue.org",
    ]


def test_cors_origins_from_os_environ(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://food-helper.vercel.app")
    settings = Settings()
    assert settings.CORS_ORIGINS == ["https://food-helper.vercel.app"]


def test_cors_origins_multi_from_os_environ(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000, https://food-helper.vercel.app")
    settings = Settings()
    assert settings.CORS_ORIGINS == ["http://localhost:3000", "https://food-helper.vercel.app"]


def test_cors_origins_json_array():
    settings = Settings(CORS_ORIGINS='["http://localhost:3000", "https://food-helper.vercel.app"]')
    assert settings.CORS_ORIGINS == ["http://localhost:3000", "https://food-helper.vercel.app"]


def test_cors_origins_list():
    settings = Settings(CORS_ORIGINS=["http://localhost:3000", "https://food-helper.vercel.app"])
    assert settings.CORS_ORIGINS == ["http://localhost:3000", "https://food-helper.vercel.app"]


def test_cors_origins_empty_string():
    settings = Settings(CORS_ORIGINS="")
    assert settings.CORS_ORIGINS == []
