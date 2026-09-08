import random

from src.anomaly_detector import detect_anomalies


def _stable_baseline(n: int = 100, mean: float = 50.0, spread: float = 1.0) -> list[float]:
    rng = random.Random(42)
    return [mean + rng.uniform(-spread, spread) for _ in range(n)]


def test_flags_an_obvious_outlier():
    baseline = _stable_baseline()
    recent = [51.0, 49.5, 500.0, 50.2]  # one blatant outlier among normal-range points

    results = detect_anomalies(baseline, recent, min_samples=30)

    assert len(results) == 1
    assert results[0].index == 2
    assert results[0].value == 500.0
    assert results[0].severity in ("warning", "critical")


def test_does_not_flag_in_range_points():
    baseline = _stable_baseline()
    recent = [50.5, 49.2, 50.8, 49.9]  # all within baseline's normal range

    results = detect_anomalies(baseline, recent, min_samples=30)

    assert results == []


def test_returns_nothing_below_min_samples():
    baseline = _stable_baseline(n=10)  # fewer than min_samples
    recent = [500.0]

    results = detect_anomalies(baseline, recent, min_samples=30)

    assert results == []


def test_returns_nothing_for_empty_recent():
    baseline = _stable_baseline()

    results = detect_anomalies(baseline, [], min_samples=30)

    assert results == []


def test_critical_severity_for_extreme_scores():
    baseline = _stable_baseline()
    recent = [10000.0]  # extreme outlier -> very negative decision_function score

    results = detect_anomalies(baseline, recent, min_samples=30)

    assert len(results) == 1
    assert results[0].severity == "critical"


def test_expected_value_is_baseline_mean():
    baseline = _stable_baseline()
    recent = [500.0]

    results = detect_anomalies(baseline, recent, min_samples=30)

    assert len(results) == 1
    assert results[0].expected_value == sum(baseline) / len(baseline)
