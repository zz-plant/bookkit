/**
 * The `bookkit` command: answers --help, reads the books, and dispatches.
 * Help text is in lib/bookkit-commands.ts; the commands are in lib/commands/:
 *
 *   context.ts     shared: args, books, focusBook, requireBook, takeBook,
 *                  runScript, applyChanges (flagValue, positionals: lib/cli.ts)
 *   help.ts        help, --help
 *   status.ts      status, map, bets, list, use
 *   new.ts         new, init
 *   check.ts       check [book|folder], validate, try, contract
 *   check-file.ts  check <file>
 *   judge.ts       similar, judge, rule
 *   draft.ts       draft
 *   review.ts      review
 *   define.ts      define
 *   finish.ts      finish
 *   merge.ts       merge, sync
 *   structure.ts   remove, move, rename
 *   publish.ts     dev, build, export, publish
 *   diagnose.ts    triage, redteam, probe
 *   (this file)    verify, deploy, import, propose, new-book, remove-book,
 *                  remove book: each runs a script of its own
 *
 * <command>Command() reads `args` itself; the others take their arguments.
 */

import { commandNames, findCommand } from "./lib/bookkit-commands";
import { didYouMean, wantsHelp } from "./lib/cli";
import {
	checkCommand,
	contractCommand,
	tryCommand,
	validateCommand,
} from "./lib/commands/check";
import {
	args,
	command,
	loadBooks,
	runScript,
	withBookFlag,
} from "./lib/commands/context";
import { define } from "./lib/commands/define";
import {
	probeCommand,
	redteamCommand,
	triageCommand,
} from "./lib/commands/diagnose";
import { draft } from "./lib/commands/draft";
import { finish } from "./lib/commands/finish";
import { printHelp, printHelpFor } from "./lib/commands/help";
import { judge, rule, similarCommand } from "./lib/commands/judge";
import { merge, sync } from "./lib/commands/merge";
import { createNew } from "./lib/commands/new";
import {
	buildCommand,
	devCommand,
	exportCommand,
	publish,
} from "./lib/commands/publish";
import { review } from "./lib/commands/review";
import {
	betsCommand,
	listCommand,
	mapCommand,
	statusCommand,
	useCommand,
} from "./lib/commands/status";
import {
	moveTool,
	removeRecord,
	renameChapter,
} from "./lib/commands/structure";

if (command === "help" || command === "--help" || command === "-h") {
	// `help <command>` is that command's help; `help --help` is help's own.
	if (command === "help" && args[1]) {
		printHelpFor(args[1].startsWith("-") ? ["help"] : args.slice(1));
	}
	printHelp();
	process.exit(0);
}
// `bookkit <command> --help` prints that command's help before it reads or
// writes anything (lib/bookkit-commands.ts).
if (findCommand(command) && wantsHelp(args.slice(1))) printHelpFor(args);

loadBooks();

switch (findCommand(command)?.name ?? command) {
	case "status": {
		await statusCommand();
		break;
	}

	case "map": {
		await mapCommand();
		break;
	}

	case "bets": {
		await betsCommand();
		break;
	}

	case "triage": {
		await triageCommand();
		break;
	}

	case "redteam": {
		redteamCommand();
		break;
	}

	case "probe": {
		probeCommand();
		break;
	}

	case "similar": {
		await similarCommand();
		break;
	}

	case "verify": {
		process.exit(runScript("verify.ts", args.slice(1)));
		break;
	}

	case "check": {
		await checkCommand();
		break;
	}

	case "new": {
		createNew(args[1], args.slice(2));
		break;
	}

	case "judge": {
		process.exit(await judge(args.slice(1)));
		break;
	}

	case "draft": {
		process.exit(await draft(args.slice(1)));
		break;
	}

	case "define": {
		process.exit(await define(args.slice(1)));
		break;
	}

	case "finish": {
		process.exit(await finish(args.slice(1)));
		break;
	}

	case "review": {
		process.exit(await review(args.slice(1)));
		break;
	}

	case "rule": {
		process.exit(rule(args.slice(1)));
		break;
	}

	case "merge": {
		process.exit(merge(args.slice(1)));
		break;
	}

	case "rename": {
		process.exit(renameChapter(args.slice(1)));
		break;
	}

	case "export": {
		exportCommand();
		break;
	}

	case "sync": {
		process.exit(sync(args.slice(1)));
		break;
	}

	case "try": {
		tryCommand();
		break;
	}

	case "contract": {
		contractCommand();
		break;
	}

	case "dev": {
		await devCommand();
		break;
	}

	case "build": {
		await buildCommand();
		break;
	}

	case "validate": {
		validateCommand();
		break;
	}

	case "list": {
		listCommand();
		break;
	}

	case "new-book": {
		process.exit(runScript("scaffold-book.ts", args.slice(1)));
		break;
	}

	case "remove-book": {
		process.exit(runScript("remove-book.ts", args.slice(1)));
		break;
	}

	case "remove": {
		if (args[1] === "book") {
			process.exit(runScript("remove-book.ts", args.slice(2)));
		}
		process.exit(removeRecord(args.slice(1)));
		break;
	}

	case "move": {
		process.exit(moveTool(args.slice(1)));
		break;
	}

	case "import": {
		process.exit(
			runScript("import-book-from-markdown.ts", withBookFlag(args.slice(1))),
		);
		break;
	}

	case "propose": {
		process.exit(runScript("propose-book.ts", withBookFlag(args.slice(1))));
		break;
	}

	case "publish": {
		process.exit(publish(args.slice(1)));
		break;
	}

	case "init": {
		createNew("book", args.slice(1));
		break;
	}

	case "deploy": {
		// Verifies and checks every book, then publishes all or none: scripts/deploy.ts.
		process.exit(runScript("deploy.ts", args.slice(1)));
		break;
	}

	case "use": {
		useCommand();
		break;
	}

	default: {
		console.error(
			`Unknown command "${command}".${didYouMean(command, commandNames())} Run bun run bookkit help for every command.`,
		);
		process.exit(1);
	}
}
