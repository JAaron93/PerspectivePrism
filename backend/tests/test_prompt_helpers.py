from app.utils.prompt_helpers import build_user_data_prompt, USER_DATA_START, USER_DATA_END


def test_build_user_data_prompt_string():
    prompt = build_user_data_prompt("sample data text", "Extract claims")
    assert USER_DATA_START in prompt
    assert USER_DATA_END in prompt
    assert "sample data text" in prompt
    assert "Extract claims" in prompt


def test_build_user_data_prompt_dict():
    fields = {"CLAIM": "Test claim", "PERSPECTIVE": "Scientific"}
    prompt = build_user_data_prompt(fields, "Analyze claim")
    assert "CLAIM: Test claim" in prompt
    assert "PERSPECTIVE: Scientific" in prompt
    assert USER_DATA_START in prompt
    assert USER_DATA_END in prompt
    assert "Analyze claim" in prompt
