/* 与 project JS 工具里手写解析器行为一致的 CSV 解析：
   - 只剔除文件最前面的 UTF-8 BOM
   - 引号内的 \n 属于字段内容（可多行字段）
   - \r 一律忽略（CRLF 与 LF 等价）
   - 末尾空行丢弃 */
pub fn parse(text: &str) -> Vec<Vec<String>> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if quoted {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    field.push('"');
                    chars.next();
                } else {
                    quoted = false;
                }
            } else {
                field.push(ch);
            }
            continue;
        }
        match ch {
            '"' => quoted = true,
            ',' => {
                row.push(std::mem::take(&mut field));
            }
            '\n' => {
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
            }
            '\r' => {}
            _ => field.push(ch),
        }
    }
    row.push(field);
    rows.push(row);
    while rows.len() > 1 {
        let last = rows.last().unwrap();
        if last.len() == 1 && last[0].is_empty() {
            rows.pop();
        } else {
            break;
        }
    }
    rows
}

pub fn escape_field(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\r') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}
