use pyo3::prelude::*;
use regex::Regex;
use once_cell::sync::Lazy;

static SUSPICIOUS_REGEX: Lazy<Regex> = Lazy::new(|| {
    let patterns = [
        r"ignore\s+(previous|above|all)\s+instructions?",
        r"system\s*:",
        r"assistant\s*:",
        r"user\s*:",
        r"<\|im_start\|>",
        r"<\|im_end\|>",
        r"\[inst\]",
        r"\[/inst\]",
        r"###\s*instruction",
        r"###\s*response",
        r"```\s*system",
        r"forget\s+(everything|all|previous)",
        r"you\s+are\s+now",
        r"pretend\s+to\s+be",
        r"act\s+as\s+a",
    ];
    let combined = patterns.join("|");
    regex::RegexBuilder::new(&combined)
        .case_insensitive(true)
        .build()
        .expect("Failed to compile suspicious patterns regex")
});

static CONTROL_CHAR_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"[\p{C}&&[^\t\n\r]]").expect("Failed to compile control char regex")
});

#[pymodule]
mod prism_sanitizer_rs {
    use super::*;

    #[pyfunction]
    fn contains_control_characters(text: &str) -> bool {
        CONTROL_CHAR_REGEX.is_match(text)
    }

    #[pyfunction]
    fn contains_suspicious_patterns(text: &str) -> bool {
        SUSPICIOUS_REGEX.is_match(text)
    }

    #[pyfunction]
    fn escape_special_characters(text: &str) -> String {
        let mut text = text.replace("\r\n", "\n").replace('\r', "\n");
        text = text.replace('\\', "\\\\");
        text = text.replace('"', "\\\"");
        text = text.replace('\'', "\\'");
        text = text.replace('{', "\\{");
        text = text.replace('}', "\\}");
        text
    }
}
