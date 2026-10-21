"""Publish static main files and snapshots of every open same-repository PR.

Never check out or execute PR scripts. Only allowlisted public assets are copied.
"""

import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
from urllib.request import Request, urlopen


PUBLIC_DIRS = {"assets", "css", "js", "editor"}


def git(*args):
    return subprocess.check_output(["git", *args])


def public_path(path):
    parts = PurePosixPath(path).parts
    return bool(parts) and (
        parts[0] in PUBLIC_DIRS
        or (len(parts) == 1 and (path.endswith(".html") or path == "CNAME"))
    )


def export_static(commit, destination):
    records = git("ls-tree", "-r", "-z", commit).split(b"\0")
    files = []
    for record in filter(None, records):
        metadata, raw_path = record.split(b"\t", 1)
        path = raw_path.decode("utf-8")
        if not public_path(path):
            continue
        mode, kind, _ = metadata.split()
        if kind != b"blob" or mode not in (b"100644", b"100755"):
            raise ValueError(f"Static assets must be regular files: {path}")
        files.append(path)
    if "index.html" not in files:
        raise ValueError("Missing index.html")
    destination.mkdir(parents=True, exist_ok=True)
    archive = git("archive", "--format=tar", commit, "--", *files)
    with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
        for member in bundle:
            if not (member.isfile() or member.isdir()):
                raise ValueError(f"Unexpected archive entry: {member.name}")
            if member.isfile() and not public_path(member.name):
                raise ValueError(f"Unexpected public file: {member.name}")
            target = destination.joinpath(*PurePosixPath(member.name).parts)
            if not target.resolve().is_relative_to(destination.resolve()):
                raise ValueError(f"Archive path escapes destination: {member.name}")
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as source, target.open("wb") as output:
                    shutil.copyfileobj(source, output)


def open_previews(repository, token):
    previews = []
    page = 1
    while True:
        request = Request(
            f"https://api.github.com/repos/{repository}/pulls?state=open&base=main&per_page=100&page={page}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28"},
        )
        with urlopen(request, timeout=60) as response:
            pulls = json.load(response)
        for pull in pulls:
            if (pull["head"].get("repo") or {}).get("full_name") != repository:
                continue
            number, sha = pull["number"], pull["head"]["sha"]
            if not isinstance(number, int) or not re.fullmatch(r"[0-9a-f]{40}", sha):
                raise ValueError("Invalid PR metadata")
            previews.append({"number": number, "sha": sha})
        if len(pulls) < 100:
            return previews
        page += 1


def main():
    output = Path("_site")
    if output.exists():
        raise ValueError("Build output must be a fresh directory")
    # Fetch current state even if this run was queued by an older event.
    git("fetch", "--depth=1", "origin", "main")
    export_static(git("rev-parse", "FETCH_HEAD").decode().strip(), output)
    previews = open_previews(os.environ["GITHUB_REPOSITORY"], os.environ["GH_TOKEN"])
    for preview in previews:
        git("fetch", "--depth=1", "origin", preview["sha"])
        preview_dir = output / "pr-preview" / f"pr-{preview['number']}"
        export_static(preview["sha"], preview_dir)
        # Only the production root owns the custom domain.
        (preview_dir / "CNAME").unlink(missing_ok=True)
        (preview_dir / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
        # Prevent preview copies from appearing as duplicate search results.
        for html in preview_dir.rglob("*.html"):
            content = html.read_text(encoding="utf-8")
            content = re.sub(r"<head\b[^>]*>", lambda m: m[0] + '\n<meta name="robots" content="noindex, nofollow">',
                             content, count=1, flags=re.IGNORECASE)
            html.write_text(content, encoding="utf-8")
    (output / ".nojekyll").touch()
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
        stream.write(f"previews={json.dumps(previews, separators=(',', ':'))}\n")
    print(f"Prepared production and {len(previews)} PR preview(s).")


if __name__ == "__main__":
    main()
