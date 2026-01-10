"""
Starlight CLI - Main Entry Point
Phase 8, 15 & 13: Developer Experience Tooling for CBA

Usage:
    python -m cli.main <command> [options]
    
Commands:
    init <name>     Scaffold a new CBA project
    create <name>   Generate a new Sentinel boilerplate
    run             Launch the constellation (Hub + Sentinels)
    doctor          Validate development environment
    triage          Open time-travel debugging UI
    install <src>   Install a plugin from GitHub or registry
    list            List installed sentinels
    remove <name>   Uninstall a plugin
    nl <text>       Execute natural language instruction (Phase 13)
    feature <path>  Execute Gherkin .feature file (Phase 13)
    document        Generate .feature from mission trace (Phase 13)
"""

import argparse
import sys

from cli.commands import init_cmd, create_cmd, run_cmd, doctor_cmd, triage_cmd
from cli.commands import install_cmd, list_cmd, remove_cmd
from cli.commands import nl_cmd, feature_cmd, document_cmd


def main():
    parser = argparse.ArgumentParser(
        prog="starlight",
        description="Starlight CLI - Constellation Based Automation Developer Tools",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    starlight init my_project       Create a new CBA project
    starlight create obstacle       Generate ObstacleSentinel
    starlight run                   Launch Hub and all Sentinels
    starlight doctor                Check environment prerequisites
    starlight triage                Open mission trace debugger
    
Plugin Management:
    starlight install cookie-consent   Install from registry
    starlight install <github-url>     Install from GitHub
    starlight list --available         Show registry plugins
    starlight remove <plugin-name>     Uninstall a plugin

Natural Language (Phase 13):
    starlight nl "Login and add item to cart"    Execute NL instruction
    starlight feature test/checkout.feature      Execute Gherkin file
    starlight document --output checkout         Generate .feature from trace
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # init command
    init_parser = subparsers.add_parser("init", help="Scaffold a new CBA project")
    init_parser.add_argument("name", help="Project name (will create directory)")
    
    # create command
    create_parser = subparsers.add_parser("create", help="Generate a new Sentinel")
    create_parser.add_argument("name", help="Sentinel name (e.g., 'obstacle' -> ObstacleSentinel)")
    
    # run command
    run_parser = subparsers.add_parser("run", help="Launch the constellation")
    run_parser.add_argument("--intent", "-i", help="Path to intent script to execute")
    run_parser.add_argument("--no-sentinels", action="store_true", help="Start Hub only")
    
    # doctor command
    subparsers.add_parser("doctor", help="Validate development environment")
    
    # triage command
    subparsers.add_parser("triage", help="Open time-travel debugging UI")
    
    # install command (Phase 15)
    install_parser = subparsers.add_parser("install", help="Install a plugin")
    install_parser.add_argument("source", help="Plugin name from registry or GitHub URL")
    
    # list command (Phase 15)
    list_parser = subparsers.add_parser("list", help="List installed sentinels")
    list_parser.add_argument("--available", "-a", action="store_true", help="Show available plugins from registry")
    
    # remove command (Phase 15)
    remove_parser = subparsers.add_parser("remove", help="Uninstall a plugin")
    remove_parser.add_argument("name", help="Plugin name to remove")
    
    # nl command (Phase 13 - Natural Language)
    nl_parser = subparsers.add_parser("nl", help="Execute natural language instruction")
    nl_parser.add_argument("instruction", help="Natural language instruction to execute")
    nl_parser.add_argument("--headless", action="store_true", help="Run in headless mode")
    nl_parser.add_argument("--status", action="store_true", help="Show NLI parser status")
    
    # feature command (Phase 13 - Gherkin)
    feature_parser = subparsers.add_parser("feature", help="Execute Gherkin .feature file")
    feature_parser.add_argument("path", help="Path to .feature file")
    feature_parser.add_argument("--scenario", "-s", help="Run only this scenario")
    feature_parser.add_argument("--headless", action="store_true", help="Run in headless mode")
    
    # document command (Phase 13 - Self-documenting)
    document_parser = subparsers.add_parser("document", help="Generate .feature from mission trace")
    document_parser.add_argument("--trace", "-t", help="Path to mission_trace.json")
    document_parser.add_argument("--output", "-o", default="generated", help="Output filename (without .feature)")
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        sys.exit(0)
    
    # Dispatch to command handlers
    if args.command == "init":
        init_cmd.execute(args.name)
    elif args.command == "create":
        create_cmd.execute(args.name)
    elif args.command == "run":
        run_cmd.execute(intent=args.intent, no_sentinels=args.no_sentinels)
    elif args.command == "doctor":
        doctor_cmd.execute()
    elif args.command == "triage":
        triage_cmd.execute()
    elif args.command == "install":
        install_cmd.execute(args.source)
    elif args.command == "list":
        list_cmd.execute(show_available=args.available)
    elif args.command == "remove":
        remove_cmd.execute(args.name)
    elif args.command == "nl":
        if args.status:
            nl_cmd.status()
        else:
            nl_cmd.execute(args.instruction, headless=args.headless)
    elif args.command == "feature":
        feature_cmd.execute(args.path, scenario=args.scenario, headless=args.headless)
    elif args.command == "document":
        document_cmd.execute(trace_path=args.trace, output=args.output)


if __name__ == "__main__":
    main()

