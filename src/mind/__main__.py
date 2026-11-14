# Filename: __main__.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Command line entry point: `mind` or `python -m mind` starts the local server."""

from __future__ import annotations

import argparse
import logging
from collections.abc import Sequence
from pathlib import Path

import uvicorn

from mind import __version__
from mind.config import Settings, load_settings
from mind.sm1 import compute_report, format_report
from mind.web.app import create_app
from mind.workspaces.registry import WorkspaceRegistry


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mind", description="Run the MIND local server.")
    parser.add_argument("--host", help="Interface to bind (default: 127.0.0.1).")
    parser.add_argument("--port", type=int, help="Port to listen on (default: 8000).")
    parser.add_argument("--data-dir", type=Path, help="Directory for app data.")
    parser.add_argument("--version", action="version", version=f"mind {__version__}")
    commands = parser.add_subparsers(dest="command")
    sm1 = commands.add_parser("sm1", help="Report the share of cards approved without edits.")
    sm1.add_argument("--workspace", type=int, help="Only this workspace id (default: all).")
    # SUPPRESS keeps a value given before the subcommand from being overwritten by the default.
    sm1.add_argument("--data-dir", type=Path, default=argparse.SUPPRESS, help="App data directory.")
    return parser


def resolve_settings(args: argparse.Namespace) -> Settings:
    settings = load_settings(env_file=Path(".env"))
    overrides: dict[str, object] = {}
    if args.host:
        overrides["host"] = args.host
    if args.port:
        overrides["port"] = args.port
    if args.data_dir:
        overrides["data_dir"] = args.data_dir
    return Settings.model_validate({**settings.model_dump(), **overrides})


def run_sm1(args: argparse.Namespace, settings: Settings) -> None:
    registry = WorkspaceRegistry(settings)
    try:
        workspaces = [w for w in registry.list() if args.workspace in (None, w.id)]
        if not workspaces:
            print("Nenhum workspace encontrado.")
        for workspace in workspaces:
            sessions = registry.open(workspace.id).sessions
            print(format_report(workspace.name, compute_report(sessions)))
    finally:
        registry.close()


def main(argv: Sequence[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    settings = resolve_settings(args)
    if args.command == "sm1":
        run_sm1(args, settings)
        return
    logging.basicConfig(level=settings.log_level)
    uvicorn.run(
        create_app(settings),
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
