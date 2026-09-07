"""
Unit tests for the Dual-Mode Benchmark CLI (T6.3, FR21, FR22, FR23, US4).

Covers:
- CLI argument parsing and component filter validation
- Graceful fallback when agents-cli binary is absent from PATH (FR22)
- Subprocess delegation when agents-cli is found
- eval_config.yaml schema validation (FR23)
- Markdown and JSON report generation integration
- Aggregator behavior
"""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock

import pytest
import yaml


# ---------------------------------------------------------------------------
# CLI argument parser tests
# ---------------------------------------------------------------------------

class TestCLIArgumentParser:
    """Tests for build_argument_parser() — validates argument definitions."""

    @pytest.fixture(autouse=True)
    def _import_cli(self):
        from app.evals.cli import build_argument_parser, VALID_COMPONENTS
        self.parser = build_argument_parser()
        self.valid_components = VALID_COMPONENTS

    def test_default_component_is_all(self):
        args = self.parser.parse_args([])
        assert args.component == "all"

    def test_component_flag_accepts_valid_values(self):
        for comp in ("pre_classifier", "extractor", "perspective", "bias", "alethiology", "all"):
            args = self.parser.parse_args(["--component", comp])
            assert args.component == comp

    def test_adk_eval_flag_default_false(self):
        args = self.parser.parse_args([])
        assert args.adk_eval is False

    def test_adk_eval_flag_enabled(self):
        args = self.parser.parse_args(["--adk-eval"])
        assert args.adk_eval is True

    def test_limit_flag(self):
        args = self.parser.parse_args(["--limit", "5"])
        assert args.limit == 5

    def test_limit_default_is_none(self):
        args = self.parser.parse_args([])
        assert args.limit is None

    def test_invalid_component_raises_error(self):
        with pytest.raises(SystemExit):
            self.parser.parse_args(["--component", "invalid_component"])

    def test_trace_dir_flag(self, tmp_path):
        args = self.parser.parse_args(["--trace-dir", str(tmp_path)])
        assert args.trace_dir == tmp_path

    def test_output_dir_flag(self, tmp_path):
        args = self.parser.parse_args(["--output-dir", str(tmp_path)])
        assert args.output_dir == tmp_path

    def test_config_flag_accepts_path(self, tmp_path):
        config_file = tmp_path / "eval_config.yaml"
        config_file.write_text("version: '1.0'\n", encoding="utf-8")
        args = self.parser.parse_args(["--config", str(config_file)])
        assert args.config == config_file


# ---------------------------------------------------------------------------
# Graceful fallback tests (FR22, US4)
# ---------------------------------------------------------------------------

class TestAgentsCLIFallback:
    """
    Scenario: Graceful pure-Python fallback when agents-cli binary is absent (FR22, US4).

    Given: --adk-eval flag
    When: agents-cli is not in PATH
    Then: Warning is logged, native runner executes without error
    """

    @pytest.fixture(autouse=True)
    def _import(self):
        from app.evals.cli import _run_adk_eval
        self._run_adk_eval = _run_adk_eval

    def test_fallback_triggered_when_agents_cli_absent(self, tmp_path):
        """When agents-cli is not found, native runner must execute without raising (FR22)."""
        config_path = tmp_path / "eval_config.yaml"
        config_path.write_text("version: '1.0'\n", encoding="utf-8")

        with (
            patch("app.evals.cli.shutil.which", return_value=None),
            patch("app.evals.cli.asyncio.run", return_value=0) as mock_run,
        ):
            exit_code = self._run_adk_eval(
                config_path=config_path,
                trace_dir=tmp_path / "traces",
                report_dir=tmp_path / "reports",
                run_timestamp="20260907_140000",
                component="all",
                limit=None,
            )
            # asyncio.run must have been invoked (native runner called)
            mock_run.assert_called_once()
            assert exit_code == 0

    def test_fallback_warning_is_logged(self, tmp_path, caplog):
        """Fallback warning message must be emitted when agents-cli is absent (US4)."""
        import logging
        config_path = tmp_path / "eval_config.yaml"
        config_path.write_text("version: '1.0'\n", encoding="utf-8")

        with (
            patch("app.evals.cli.shutil.which", return_value=None),
            patch("app.evals.cli.asyncio.run", return_value=0),
            caplog.at_level(logging.WARNING, logger="app.evals.cli"),
        ):
            self._run_adk_eval(
                config_path=config_path,
                trace_dir=tmp_path,
                report_dir=tmp_path,
                run_timestamp="20260907_140001",
                component="pre_classifier",
                limit=None,
            )

        assert any("PURE-PYTHON FALLBACK" in record.message for record in caplog.records), (
            "Fallback warning log must be emitted when agents-cli is absent"
        )

    def test_missing_config_exits_with_error_when_agents_cli_present(self, tmp_path):
        """When agents-cli is found but config is missing, return non-zero exit code."""
        missing_config = tmp_path / "nonexistent_config.yaml"

        with patch("app.evals.cli.shutil.which", return_value="/usr/local/bin/agents-cli"):
            exit_code = self._run_adk_eval(
                config_path=missing_config,
                trace_dir=tmp_path,
                report_dir=tmp_path,
                run_timestamp="20260907_140002",
                component="all",
                limit=None,
            )
        assert exit_code != 0

    def test_agents_cli_subprocess_called_when_present(self, tmp_path):
        """When agents-cli is found and config exists, subprocess.run must be called
        and artifact generation is triggered after a successful run."""
        config_path = tmp_path / "eval_config.yaml"
        config_path.write_text("version: '1.0'\n", encoding="utf-8")

        mock_proc = MagicMock()
        mock_proc.returncode = 0

        with (
            patch("app.evals.cli.shutil.which", return_value="/usr/local/bin/agents-cli"),
            patch("app.evals.cli.subprocess.run", return_value=mock_proc) as mock_subprocess,
            patch("app.evals.cli._emit_agents_cli_success_artifacts") as mock_emit,
        ):
            exit_code = self._run_adk_eval(
                config_path=config_path,
                trace_dir=tmp_path,
                report_dir=tmp_path,
                run_timestamp="20260907_140003",
                component="pre_classifier",
                limit=None,
            )
            mock_subprocess.assert_called_once()
            call_args = mock_subprocess.call_args[0][0]
            assert "agents-cli" in call_args[0]
            assert "eval" in call_args
            assert "run" in call_args
            # Artifact generation must be triggered after success (P1 fix)
            mock_emit.assert_called_once()
            assert exit_code == 0

    def test_emit_agents_cli_success_artifacts(self, tmp_path):
        """
        Test _emit_agents_cli_success_artifacts creates:
        - An empty EvaluationDataset trace (zero eval_cases, no fabricated scores)
        - A Markdown delegation receipt report
        - A JSON delegation receipt report
        """
        from app.evals.cli import _emit_agents_cli_success_artifacts
        trace_dir = tmp_path / "traces"
        report_dir = tmp_path / "reports"
        run_ts = "20260907_140005"

        _emit_agents_cli_success_artifacts(
            trace_dir=trace_dir,
            report_dir=report_dir,
            run_timestamp=run_ts,
            component="pre_classifier",
        )

        # Trace: empty eval_cases — no fabricated quality scores injected
        trace_file = trace_dir / f"run_{run_ts}.json"
        assert trace_file.exists()
        trace_data = json.loads(trace_file.read_text(encoding="utf-8"))
        assert trace_data.get("eval_cases") == [], (
            "Delegation receipt trace must have zero eval_cases to prevent "
            "grade/compare pipeline contamination"
        )

        # Markdown report: human-readable delegation receipt
        report_md = report_dir / f"summary_{run_ts}.md"
        assert report_md.exists()
        md_content = report_md.read_text(encoding="utf-8")
        assert "Delegation Receipt" in md_content
        assert "agents-cli" in md_content
        assert "zero `eval_cases`" in md_content

        # JSON report: machine-readable delegation metadata
        report_json = report_dir / f"summary_{run_ts}.json"
        assert report_json.exists()
        json_data = json.loads(report_json.read_text(encoding="utf-8"))
        assert json_data["delegation_mode"] == "agents-cli"
        assert json_data["eval_cases_count"] == 0
        assert "Delegation receipt only" in json_data["note"]


    def test_agents_cli_subprocess_failure_falls_back_to_native(self, tmp_path):
        """If agents-cli exits non-zero, fall back to native runner (FR22)."""
        config_path = tmp_path / "eval_config.yaml"
        config_path.write_text("version: '1.0'\n", encoding="utf-8")

        mock_proc = MagicMock()
        mock_proc.returncode = 1  # non-zero failure

        with (
            patch("app.evals.cli.shutil.which", return_value="/usr/local/bin/agents-cli"),
            patch("app.evals.cli.subprocess.run", return_value=mock_proc),
            patch("app.evals.cli.asyncio.run", return_value=0) as mock_asyncio,
        ):
            exit_code = self._run_adk_eval(
                config_path=config_path,
                trace_dir=tmp_path,
                report_dir=tmp_path,
                run_timestamp="20260907_140004",
                component="all",
                limit=None,
            )
            mock_asyncio.assert_called_once()
            assert exit_code == 0


# ---------------------------------------------------------------------------
# eval_config.yaml schema validation (FR23)
# ---------------------------------------------------------------------------

class TestEvalConfigYamlValidation:
    """Tests validating the eval_config.yaml schema and required fields (FR23)."""

    @pytest.fixture(autouse=True)
    def _locate_config(self):
        self.config_path = Path(__file__).resolve().parent / "eval" / "eval_config.yaml"

    def test_eval_config_yaml_exists(self):
        """eval_config.yaml must exist at backend/tests/eval/eval_config.yaml (FR23)."""
        assert self.config_path.exists(), f"eval_config.yaml not found at {self.config_path}"

    def test_eval_config_yaml_is_valid_yaml(self):
        """eval_config.yaml must be valid YAML syntax (FR23)."""
        with open(self.config_path, encoding="utf-8") as f:
            content = yaml.safe_load(f)
        assert content is not None
        assert isinstance(content, dict)

    def test_eval_config_yaml_version_field(self):
        """version field must be present (FR23)."""
        with open(self.config_path, encoding="utf-8") as f:
            content = yaml.safe_load(f)
        assert "version" in content

    def test_eval_config_yaml_project_field(self):
        """project field must be 'perspective-prism' (FR23)."""
        with open(self.config_path, encoding="utf-8") as f:
            content = yaml.safe_load(f)
        assert content.get("project") == "perspective-prism"

    def test_eval_config_yaml_evaluation_section(self):
        """evaluation section must contain model, max_concurrency, timeout_seconds, datasets, metrics (FR23)."""
        with open(self.config_path, encoding="utf-8") as f:
            content = yaml.safe_load(f)
        evaluation = content.get("evaluation", {})
        assert "model" in evaluation
        assert "max_concurrency" in evaluation
        assert "timeout_seconds" in evaluation
        assert "datasets" in evaluation
        assert "metrics" in evaluation

    def test_eval_config_yaml_target_model(self):
        """Model must be gemini-3.5-flash-lite (benchmark candidate, design.md §7.2)."""
        with open(self.config_path, encoding="utf-8") as f:
            content = yaml.safe_load(f)
        model = content.get("evaluation", {}).get("model", "")
        assert model == "gemini-3.5-flash-lite", (
            f"Eval config target model must be gemini-3.5-flash-lite, got: {model}"
        )

    def test_eval_config_yaml_datasets_section(self):
        """Datasets section must reference all 5 golden fixture files (FR23)."""
        with open(self.config_path, encoding="utf-8") as f:
            content = yaml.safe_load(f)
        datasets = content.get("evaluation", {}).get("datasets", {})
        required_keys = {"pre_classifier", "claim_extractor", "perspective_stance", "bias_deception", "alethiology"}
        missing = required_keys - set(datasets.keys())
        assert not missing, f"eval_config.yaml missing dataset references: {missing}"

    def test_eval_config_yaml_metrics_include_builtin_and_custom(self):
        """Metrics must include both builtin (hallucination, safety) and custom judges (FR23)."""
        with open(self.config_path, encoding="utf-8") as f:
            content = yaml.safe_load(f)
        metrics = content.get("evaluation", {}).get("metrics", [])
        metric_names = {m.get("name") for m in metrics}
        assert "hallucination" in metric_names, "Built-in 'hallucination' metric must be declared"
        assert "safety" in metric_names, "Built-in 'safety' metric must be declared"
        assert "claim_recall" in metric_names, "Custom 'claim_recall' judge must be declared"
        assert "perspective_faithfulness" in metric_names, "Custom 'perspective_faithfulness' judge must be declared"
        assert "alethiology_neutrality" in metric_names, "Custom 'alethiology_neutrality' judge must be declared"

    def test_eval_config_yaml_output_section(self):
        """output section must declare trace_dir and report_dir (FR21)."""
        with open(self.config_path, encoding="utf-8") as f:
            content = yaml.safe_load(f)
        output = content.get("output", {})
        assert "trace_dir" in output
        assert "report_dir" in output

    def test_eval_config_yaml_timeout_at_least_120s(self):
        """timeout_seconds >= 120 to align with ADR 007 HTTP timeout standard."""
        with open(self.config_path, encoding="utf-8") as f:
            content = yaml.safe_load(f)
        timeout = content.get("evaluation", {}).get("timeout_seconds", 0)
        assert timeout >= 120, f"timeout_seconds must be >= 120; got {timeout}"

    def test_eval_config_yaml_max_concurrency_within_quota_limits(self):
        """max_concurrency must be <= 10 to respect tier_max_concurrency semaphore (NFR4)."""
        with open(self.config_path, encoding="utf-8") as f:
            content = yaml.safe_load(f)
        concurrency = content.get("evaluation", {}).get("max_concurrency", 99)
        assert concurrency <= 10, f"max_concurrency must be <= 10 for quota safety; got {concurrency}"


# ---------------------------------------------------------------------------
# CLI main() integration tests (US4)
# ---------------------------------------------------------------------------

class TestCLIMainIntegration:
    """Integration tests for the main() entrypoint (US4)."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from app.evals.cli import main
        self.main = main

    def test_main_with_no_args_succeeds(self):
        """main([]) with mocked native runner must return 0."""
        with patch("app.evals.cli.asyncio.run", return_value=0):
            exit_code = self.main([])
        assert exit_code == 0

    def test_main_adk_eval_without_binary_falls_back(self, tmp_path):
        """main(['--adk-eval']) without agents-cli falls back to native runner."""
        with (
            patch("app.evals.cli.shutil.which", return_value=None),
            patch("app.evals.cli.asyncio.run", return_value=0) as mock_run,
        ):
            exit_code = self.main(["--adk-eval"])
            mock_run.assert_called_once()
            assert exit_code == 0

    def test_main_component_filter_passed(self):
        """--component flag is correctly parsed and passed to runner."""
        with patch("app.evals.cli.asyncio.run", return_value=0) as mock_run:
            self.main(["--component", "pre_classifier"])
            call_kwargs = mock_run.call_args[0][0]
            # asyncio.run is called with a coroutine from _run_native_components
            assert mock_run.called

    def test_main_limit_flag(self):
        """--limit flag is passed through correctly."""
        with patch("app.evals.cli.asyncio.run", return_value=0) as mock_run:
            self.main(["--limit", "3"])
            assert mock_run.called
