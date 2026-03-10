import argparse
import os
import shutil
from datetime import datetime


def _resolve_paths():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    progress_path = os.path.join(root, "progress.txt")
    backup_dir = os.path.join(root, "progress_backups")
    return progress_path, backup_dir


def _ensure_progress_file(progress_path):
    if os.path.exists(progress_path):
        return
    with open(progress_path, "w", encoding="utf-8") as f:
        f.write("timestamp | issue_id | status | description | summary\n")


def _sync_backup(progress_path, backup_dir, record):
    os.makedirs(backup_dir, exist_ok=True)
    today = datetime.now().strftime("%Y%m%d")
    backup_path = os.path.join(backup_dir, f"progress_{today}.txt")
    if not os.path.exists(backup_path):
        if os.path.exists(progress_path):
            shutil.copyfile(progress_path, backup_path)
        return
    with open(backup_path, "a", encoding="utf-8") as f:
        f.write(record)


def _normalize_text(value):
    return value.replace("_", " ")


def append_progress(issue_id, description, summary, status):
    progress_path, backup_dir = _resolve_paths()
    _ensure_progress_file(progress_path)
    timestamp = datetime.now().isoformat(timespec="seconds")
    record = f"{timestamp} | {issue_id} | {status} | {_normalize_text(description)} | {_normalize_text(summary)}\n"
    with open(progress_path, "a", encoding="utf-8") as f:
        f.write(record)
    _sync_backup(progress_path, backup_dir, record)
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True)
    parser.add_argument("--desc", required=True)
    parser.add_argument("--summary", required=True)
    parser.add_argument("--status", required=True)
    args = parser.parse_args()
    append_progress(args.id, args.desc, args.summary, args.status)


if __name__ == "__main__":
    main()
