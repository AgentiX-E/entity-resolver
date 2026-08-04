//! entity-resolver-native — Rust-native ensemble scorer (P1)
//!
//! Implements ensemble_similarity(a, b) = max(jaro_winkler, token_sort, 0.8*soundex)
//! with WASM target for Node.js/browser integration.
//!
//! Reference: GoldenMatch's goldenfuzz ensemble strategy
//! License: MIT

use std::collections::HashMap;

/// Compute the ensemble similarity between two strings.
/// Returns max(jaro_winkler, token_sort, 0.8*soundex) in [0.0, 1.0].
pub fn ensemble_similarity(a: &str, b: &str) -> f64 {
    let a = a.trim().to_lowercase();
    let b = b.trim().to_lowercase();

    if a == b && !a.is_empty() { return 1.0; }
    if a.is_empty() || b.is_empty() { return 0.0; }

    let jw = jaro_winkler(&a, &b);
    let ts = token_sort_ratio(&a, &b);
    let sx = if soundex(&a) == soundex(&b) { 0.8 } else { 0.0 };

    jw.max(ts).max(sx)
}

/// Jaro-Winkler similarity [0.0, 1.0].
fn jaro_winkler(a: &str, b: &str) -> f64 {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let alen = a_chars.len();
    let blen = b_chars.len();
    if alen == 0 || blen == 0 { return 0.0; }

    let range = if alen.max(blen) > 1 { ((alen.max(blen) as f64) / 2.0).floor() as usize - 1 } else { 0 };
    let mut a_matched = vec![false; alen];
    let mut b_matched = vec![false; blen];
    let mut matches = 0;

    for i in 0..alen {
        let start = if i > range { i - range } else { 0 };
        let end = (i + range + 1).min(blen);
        for j in start..end {
            if !b_matched[j] && a_chars[i] == b_chars[j] {
                a_matched[i] = true; b_matched[j] = true; matches += 1; break;
            }
        }
    }
    if matches == 0 { return 0.0; }

    let mut trans = 0; let mut k = 0;
    for i in 0..alen {
        if a_matched[i] {
            while !b_matched[k] { k += 1; }
            if a_chars[i] != b_chars[k] { trans += 1; }
            k += 1;
        }
    }
    let jaro = ((matches as f64 / alen as f64) + (matches as f64 / blen as f64)
        + ((matches - trans / 2) as f64 / matches as f64)) / 3.0;
    if jaro < 0.7 { return jaro; }
    let prefix = a_chars.iter().zip(b_chars.iter()).take(4).take_while(|(a,b)| a==b).count();
    jaro + (prefix as f64 * 0.1 * (1.0 - jaro))
}

/// Token sort ratio [0.0, 1.0].
fn token_sort_ratio(a: &str, b: &str) -> f64 {
    let mut ta: Vec<&str> = a.split_whitespace().collect();
    let mut tb: Vec<&str> = b.split_whitespace().collect();
    ta.sort(); tb.sort();
    jaro_winkler(&ta.join(" "), &tb.join(" "))
}

/// Compute Soundex code.
fn soundex(s: &str) -> String {
    let chars: Vec<char> = s.to_uppercase().chars().collect();
    if chars.is_empty() { return String::new(); }
    let first = chars[0];
    let mapping: HashMap<char, char> = [
        ('B','1'),('F','1'),('P','1'),('V','1'),('C','2'),('G','2'),('J','2'),
        ('K','2'),('Q','2'),('S','2'),('X','2'),('Z','2'),('D','3'),('T','3'),
        ('L','4'),('M','5'),('N','5'),('R','6'),
    ].iter().cloned().collect();

    let mut code = String::from(first); let mut prev = None;
    for &c in &chars[1..] {
        if let Some(&cc) = mapping.get(&c) {
            if prev != Some(cc) { code.push(cc); prev = Some(cc); }
        } else if !matches!(c, 'A'|'E'|'I'|'O'|'U'|'H'|'W'|'Y') { prev = None; }
    }
    while code.len() < 4 { code.push('0'); }
    code[..4].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensemble_identical() {
        assert!((ensemble_similarity("John Smith", "John Smith") - 1.0).abs() < 0.001);
    }

    #[test]
    fn ensemble_reorder() {
        assert!(ensemble_similarity("John Smith", "Smith John") > 0.8);
    }

    #[test]
    fn ensemble_typo() {
        assert!(ensemble_similarity("Michael", "Micheal") > 0.8);
    }

    #[test]
    fn ensemble_empty() {
        assert_eq!(ensemble_similarity("", ""), 0.0);
        assert_eq!(ensemble_similarity("John", ""), 0.0);
    }

    #[test]
    fn soundex_same() {
        assert_eq!(soundex("Smith"), soundex("Smyth"));
        assert_eq!(soundex("Robert"), "R163");
    }

    #[test]
    fn token_sort_perfect() {
        assert!((token_sort_ratio("John Smith", "Smith John") - 1.0).abs() < 0.001);
    }
}
