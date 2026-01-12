from types import SimpleNamespace
from app.main import compute_overall_assessment
from app.core.config import settings

def test_high_deception_short_circuit():
    """Test that high deception score returns 'Suspicious/Deceptive' regardless of stances."""
    perspectives = [
        SimpleNamespace(stance="Support"),
        SimpleNamespace(stance="Support")
    ]
    # Threshold is 7.0 (inclusive)
    assert compute_overall_assessment(perspectives, 7.0) == "Suspicious/Deceptive"
    assert compute_overall_assessment(perspectives, 8.5) == "Suspicious/Deceptive"

def test_support_consensus():
    """Test 'Likely True' when support > refute and >= 2."""
    perspectives = [
        SimpleNamespace(stance="Support"),
        SimpleNamespace(stance="Support"),
        SimpleNamespace(stance="Refute")
    ]
    assert compute_overall_assessment(perspectives, 0.0) == "Likely True"

def test_refute_consensus():
    """Test 'Likely False' when refute > support and >= 2."""
    perspectives = [
        SimpleNamespace(stance="Refute"),
        SimpleNamespace(stance="Refute"),
        SimpleNamespace(stance="Support")
    ]
    assert compute_overall_assessment(perspectives, 0.0) == "Likely False"

def test_mixed_consensus():
    """Test 'Mixed' when counts are equal or insufficient."""
    # Equal
    p1 = [SimpleNamespace(stance="Support"), SimpleNamespace(stance="Refute")]
    assert compute_overall_assessment(p1, 0.0) == "Mixed"
    
    # Insufficient count (< 2)
    p2 = [SimpleNamespace(stance="Support")]
    assert compute_overall_assessment(p2, 0.0) == "Mixed"

def test_moderate_deception_downgrade():
    """Test that moderate deception downgrades 'Likely True' to 'Mixed'."""
    perspectives = [
        SimpleNamespace(stance="Support"),
        SimpleNamespace(stance="Support")
    ]
    # Normal -> Likely True
    assert compute_overall_assessment(perspectives, 0.0) == "Likely True"
    
    # Moderate Deception (>= 5.0) -> Mixed
    assert compute_overall_assessment(perspectives, 5.0) == "Mixed"
    assert compute_overall_assessment(perspectives, 6.0) == "Mixed"
    
    # Does not affect 'Likely False'
    perspectives_false = [
        SimpleNamespace(stance="Refute"),
        SimpleNamespace(stance="Refute")
    ]
    assert compute_overall_assessment(perspectives_false, 5.0) == "Likely False"
