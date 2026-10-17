"""
BDD conftest for executable Gherkin scenarios.
Imports and extends shared fixtures from root backend/tests/conftest.py.
"""
import pytest
from tests.conftest import reset_analysis_circuit_breaker

__all__ = ["reset_analysis_circuit_breaker"]
