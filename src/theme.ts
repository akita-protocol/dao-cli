import chalk from "chalk";

// ── Akita brand palette ──────────────────────────────────────────

const purple = chalk.hex("#9439e6");
const pink = chalk.hex("#f35ff2");
const green = chalk.hex("#44f8bd");
const gold = chalk.hex("#f5c434");
const yellow = chalk.hex("#FFEB00");
const darkBlue = chalk.hex("#0039CB");
const lightBlue = chalk.hex("#00F0FF");

// ── Theme tokens ─────────────────────────────────────────────────

const theme = {
  // UI chrome
  border: chalk.dim,
  panelTitle: chalk.bold.hex("#9439e6"),
  appName: chalk.bold.hex("#f35ff2"),
  activeTab: chalk.bgHex("#9439e6").white.bold,
  inactiveTab: chalk.dim,
  tabSeparator: chalk.dim,
  separator: chalk.dim,
  statusBar: chalk.inverse,
  sectionHeader: chalk.bold.hex("#9439e6"),

  // KV / table labels
  label: chalk.dim,

  // Selection / navigation
  cursor: pink,
  selected: chalk.bold,

  // Status colors
  statusApproved: green,
  statusVoting: lightBlue,
  statusDraft: gold,
  statusRejected: chalk.red,
  stateActive: green,
  stateInactive: chalk.red,
  statePaused: gold,
  boolTrue: green,
  boolFalse: chalk.dim,

  // Proposal action colors
  actionAdd: green,
  actionRemove: chalk.red,
  actionModify: gold,

  // Escrow status
  locked: chalk.red,
  unlocked: green,

  // Compact number suffixes
  suffixK: chalk.bold.white,
  suffixM: green,
  suffixB: lightBlue,
  suffixT: purple,

  // Charts
  barFilled: lightBlue,
  barEmpty: chalk.dim,
  chartLabel: chalk.bold,
  chartDim: chalk.dim,

  // Revenue split segment palette (cycled)
  splitColors: [purple, pink, green, gold, lightBlue, darkBlue, yellow],

  // Global caller
  globalCaller: green,
};

export default theme;
