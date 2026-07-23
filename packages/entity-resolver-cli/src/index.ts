// @agentix-e/entity-resolver-cli — CLI entry point.
// Command-line tool for entity resolver deduplication, matching, and diagnostics.

// TUI Diagnostics
export {
  renderWaterfallTUI,
  renderHistogramTUI,
  renderMuTableTUI,
  renderClusterTreeTUI,
  renderThresholdTUI,
  renderNavHint,
} from './tui/renderers.js';

/**
 * CLI entry point — called when the package is invoked as a command.
 * Parses arguments and delegates to subcommands.
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const command = args[0]!;

  switch (command) {
    case 'health':
      console.log('Entity Resolver CLI — operational');
      console.log(`Node.js ${process.version}`);
      break;

    case 'help':
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run `entity-resolver --help` for usage information.');
      process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`Entity Resolver CLI

Usage: entity-resolver <command> [options]

Commands:
  health              Check CLI health and Node.js version
  help                Show this help message

TUI Renderers (imported programmatically):
  renderWaterfallTUI  Render match weight waterfall chart
  renderHistogramTUI  Render match weight distribution histogram
  renderMuTableTUI    Render m/u parameter table
  renderClusterTreeTUI Render cluster tree explorer
  renderThresholdTUI  Render threshold selection UI
  renderNavHint       Render navigation hint line
`);
}

// Wire up as CLI when executed directly
if (
  process.argv[1]?.endsWith('/entity-resolver-cli') ||
  process.argv[1]?.endsWith('\\entity-resolver-cli')
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
