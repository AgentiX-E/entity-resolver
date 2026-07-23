use wasm_bindgen::prelude::*;

// ─── Levenshtein Distance (Wagner-Fischer, O(n·m) time, O(min(n,m)) space) ───

#[wasm_bindgen]
pub fn wasm_levenshtein_similarity(a: &str, b: &str) -> f64 {
    let a_len = a.chars().count();
    let b_len = b.chars().count();
    if a_len == 0 && b_len == 0 { return 1.0; }
    if a_len == 0 || b_len == 0 { return 0.0; }
    
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    
    let mut prev: Vec<usize> = (0..=b_len).collect();
    let mut curr = vec![0usize; b_len + 1];
    
    for i in 1..=a_len {
        curr[0] = i;
        for j in 1..=b_len {
            let cost = if a_chars[i-1] == b_chars[j-1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1)
                .min(curr[j-1] + 1)
                .min(prev[j-1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    
    let dist = prev[b_len] as f64;
    1.0 - dist / (a_len.max(b_len) as f64)
}

// ─── Jaro Similarity ───

#[wasm_bindgen]
pub fn wasm_jaro(a: &str, b: &str) -> f64 {
    if a == b { return 1.0; }
    let a_len = a.chars().count();
    let b_len = b.chars().count();
    if a_len == 0 || b_len == 0 { return 0.0; }
    
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    
    let match_dist = ((a_len.max(b_len) / 2) as isize - 1).max(0) as usize;
    let mut a_matched = vec![false; a_len];
    let mut b_matched = vec![false; b_len];
    let mut m = 0usize;
    
    for (i, &ac) in a_chars.iter().enumerate() {
        let start = if i > match_dist { i - match_dist } else { 0 };
        let end = (i + match_dist + 1).min(b_len);
        for (j, &bc) in b_chars[start..end].iter().enumerate() {
            if !b_matched[start + j] && ac == bc {
                a_matched[i] = true;
                b_matched[start + j] = true;
                m += 1;
                break;
            }
        }
    }
    
    if m == 0 { return 0.0; }
    
    let mut t = 0usize;
    let mut k = 0usize;
    for i in 0..a_len {
        if a_matched[i] {
            while k < b_len && !b_matched[k] { k += 1; }
            if k < b_len && a_chars[i] != b_chars[k] { t += 1; }
            k += 1;
        }
    }
    t /= 2;
    
    let m_f = m as f64;
    (m_f / a_len as f64 + m_f / b_len as f64 + (m_f - t as f64) / m_f) / 3.0
}

// ─── Jaro-Winkler ───

#[wasm_bindgen]
pub fn wasm_jaro_winkler(a: &str, b: &str, p: f64) -> f64 {
    let j = wasm_jaro(a, b);
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let mut l = 0usize;
    for (ca, cb) in a_chars.iter().zip(b_chars.iter()) {
        if ca == cb { l += 1; } else { break; }
        if l >= 4 { break; }
    }
    j + (p * l as f64 * (1.0 - j))
}

// ─── Dice Coefficient ───

#[wasm_bindgen]
pub fn wasm_dice(a: &str, b: &str) -> f64 {
    if a == b { return 1.0; }
    let a_len = a.chars().count();
    let b_len = b.chars().count();
    if a_len < 2 || b_len < 2 { return 0.0; }
    
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let mut overlap = 0usize;
    
    for i in 0..a_len - 1 {
        let bg_a = (a_chars[i], a_chars[i+1]);
        for j in 0..b_len - 1 {
            if bg_a == (b_chars[j], b_chars[j+1]) {
                overlap += 1;
            }
        }
    }
    
    (2.0 * overlap as f64) / ((a_len - 1 + b_len - 1) as f64)
}

// ─── Soundex ───

fn soundex_code(s: &str) -> String {
    let chars: Vec<char> = s.to_uppercase().chars().collect();
    if chars.is_empty() { return String::new(); }
    
    let first = chars[0];
    let mut prev = ' ';
    let mut code = String::from(first);
    
    for &c in &chars[1..] {
        let digit = match c {
            'B' | 'F' | 'P' | 'V' => Some('1'),
            'C' | 'G' | 'J' | 'K' | 'Q' | 'S' | 'X' | 'Z' => Some('2'),
            'D' | 'T' => Some('3'),
            'L' => Some('4'),
            'M' | 'N' => Some('5'),
            'R' => Some('6'),
            _ => None,
        };
        if let Some(d) = digit {
            if d != prev {
                code.push(d);
                prev = d;
            }
        } else {
            prev = ' ';
        }
    }
    
    while code.len() < 4 { code.push('0'); }
    code[..4].to_string()
}

#[wasm_bindgen]
pub fn wasm_soundex_match(a: &str, b: &str) -> f64 {
    let ca = soundex_code(a);
    let cb = soundex_code(b);
    if ca.is_empty() || cb.is_empty() { return 0.0; }
    if ca == cb { 1.0 } else { 0.0 }
}

// ─── Combined scorer (batch for JS integration) ───

#[wasm_bindgen]
pub fn wasm_score(scorer_name: &str, a: &str, b: &str) -> f64 {
    match scorer_name {
        "levenshtein" => wasm_levenshtein_similarity(a, b),
        "jaro" => wasm_jaro(a, b),
        "jaro_winkler" => wasm_jaro_winkler(a, b, 0.1),
        "dice" => wasm_dice(a, b),
        "soundex" => wasm_soundex_match(a, b),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_levenshtein() {
        assert!((wasm_levenshtein_similarity("kitten", "sitting") - 0.5714).abs() < 0.01);
        assert_eq!(wasm_levenshtein_similarity("abc", "abc"), 1.0);
    }

    #[test]
    fn test_jaro_winkler() {
        let score = wasm_jaro_winkler("MARTHA", "MARHTA", 0.1);
        assert!((score - 0.961).abs() < 0.01);
    }

    #[test]
    fn test_soundex() {
        assert_eq!(wasm_soundex_match("Robert", "Rupert"), 1.0);
        assert_eq!(wasm_soundex_match("Robert", "Michael"), 0.0);
    }
}
