from src.recommendations import (
    evaluate_error_rate_rule,
    evaluate_latency_rule,
    is_resource_metric,
)


class TestLatencyRule:
    def test_flags_regression_above_factor(self):
        assert evaluate_latency_rule(current_p95=250.0, baseline_p95=100.0, samples=25) is True

    def test_does_not_flag_below_factor(self):
        assert evaluate_latency_rule(current_p95=150.0, baseline_p95=100.0, samples=25) is False

    def test_does_not_flag_with_too_few_samples(self):
        assert evaluate_latency_rule(current_p95=500.0, baseline_p95=100.0, samples=5) is False

    def test_does_not_flag_zero_baseline(self):
        assert evaluate_latency_rule(current_p95=50.0, baseline_p95=0.0, samples=25) is False


class TestErrorRateRule:
    def test_flags_above_threshold(self):
        assert evaluate_error_rate_rule(error_ratio=0.1, samples=20) is True

    def test_does_not_flag_below_threshold(self):
        assert evaluate_error_rate_rule(error_ratio=0.02, samples=20) is False

    def test_does_not_flag_with_too_few_samples(self):
        assert evaluate_error_rate_rule(error_ratio=0.5, samples=3) is False


class TestIsResourceMetric:
    def test_matches_known_prefixes(self):
        assert is_resource_metric("process.memory.alloc") is True
        assert is_resource_metric("go.gc.pauseNs") is True
        assert is_resource_metric("system.memory.usage") is True
        assert is_resource_metric("system.cpu.usage") is True

    def test_does_not_match_unrelated_metric(self):
        assert is_resource_metric("http_requests_total") is False
        assert is_resource_metric("orders_created_total") is False
