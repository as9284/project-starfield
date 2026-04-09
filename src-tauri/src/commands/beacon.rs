use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::command;

/// Maximum number of files to return from a directory scan.
const MAX_FILES: usize = 500;

/// Maximum file size (in bytes) for reading content.
const MAX_CONTENT_SIZE: u64 = 50_000;

/// Maximum number of files whose content we'll read.
const MAX_CONTENT_FILES: usize = 40;

/// File extensions considered text / source code.
const TEXT_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "json", "md", "txt", "yaml", "yml", "toml", "rs", "py", "go",
    "java", "c", "h", "cpp", "css", "html", "vue", "svelte", "lock", "cfg", "ini", "sh", "bat",
    "env", "gitignore", "dockerfile",
];

/// Dot-prefixed files that should still be included in the scan.
const ALLOWED_DOTFILES: &[&str] = &[
    ".gitignore",
    ".env",
    ".editorconfig",
    ".eslintrc",
    ".prettierrc",
    ".dockerignore",
    ".npmrc",
    ".nvmrc",
    ".babelrc",
];
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    "vendor",
    ".idea",
    ".vscode",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFile {
    pub path: String,
    pub relative_path: String,
    pub size: u64,
    pub is_text: bool,
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub name: String,
    pub root: String,
    pub file_count: usize,
    pub files: Vec<ScannedFile>,
}

/// Walk a directory recursively, collecting file metadata and optionally content.
fn walk_dir(root: &Path, base: &Path, files: &mut Vec<ScannedFile>) {
    if files.len() >= MAX_FILES {
        return;
    }

    let entries = match fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        if files.len() >= MAX_FILES {
            return;
        }

        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        let file_name_lower = file_name.to_lowercase();

        if file_name.starts_with('.') && !ALLOWED_DOTFILES.contains(&file_name_lower.as_str()) {
            continue;
        }

        if path.is_dir() {
            if SKIP_DIRS.contains(&file_name.as_str()) {
                continue;
            }
            walk_dir(&path, base, files);
        } else if path.is_file() {
            let relative = path
                .strip_prefix(base)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");

            let size = path.metadata().map(|m| m.len()).unwrap_or(0);

            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            let is_text = TEXT_EXTENSIONS.contains(&ext.as_str())
                || file_name_lower == "dockerfile"
                || file_name_lower == "makefile";

            files.push(ScannedFile {
                path: path.to_string_lossy().to_string(),
                relative_path: relative,
                size,
                is_text,
                content: None, // filled later for priority files
            });
        }
    }
}

/// Scan a local directory, returning its file tree and content of important files.
#[command]
pub fn scan_local_directory(path: String) -> Result<ScanResult, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let mut files: Vec<ScannedFile> = Vec::new();
    walk_dir(root, root, &mut files);

    // Read content for priority text files
    let priority_order = |p: &str| -> u8 {
        let lower = p.to_lowercase();
        if lower.contains("readme") {
            return 0;
        }
        if lower.contains("package.json") || lower.contains("cargo.toml") {
            return 1;
        }
        if lower.contains("tsconfig") || lower.contains("vite.config") {
            return 2;
        }
        if lower.ends_with(".ts") || lower.ends_with(".tsx") {
            return 3;
        }
        if lower.ends_with(".rs") || lower.ends_with(".py") {
            return 4;
        }
        5
    };

    let mut text_indices: Vec<usize> = files
        .iter()
        .enumerate()
        .filter(|(_, f)| f.is_text && f.size < MAX_CONTENT_SIZE && f.size > 0)
        .map(|(i, _)| i)
        .collect();

    text_indices.sort_by_key(|&i| priority_order(&files[i].relative_path));
    text_indices.truncate(MAX_CONTENT_FILES);

    for idx in text_indices {
        if let Ok(content) = fs::read_to_string(&files[idx].path) {
            files[idx].content = Some(content);
        }
    }

    let file_count = files.len();

    Ok(ScanResult {
        name,
        root: path,
        file_count,
        files,
    })
}
