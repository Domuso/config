#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const config = require("../index");

const DEFAULT_TEMPLATE_PATH = "./config.json";

let outputPath;
let templatePath;
let interactive;

process.argv.forEach(arg => {
  const [k, v] = arg.split("=");
  if (k === "output") {
    outputPath = v;
  } else if (k === "template") {
    templatePath = v;
  } else if (k === "interactive") {
    interactive = v;
  }
});

const showWarning = !templatePath;

templatePath = path.join(process.cwd(), templatePath || DEFAULT_TEMPLATE_PATH);

if (showWarning) {
  console.warn(`\x1b[34mTemplatePath was not passed. Using default values:\
    \n\nTemplatePath: ${templatePath}\n\nenvironnement: ${process.env.NODE_ENV} \
    \n\nYou can also use the following format: \x1b[33mbuilder template=<path> output=<path>\x1b[0m\n`);
}

console.log("\x1b[32mSTARTING TO BUILD CONFIG FILE\x1b[0m\n");
execute();

async function execute() {
  let cfg = await getConfig(templatePath);

  if (!outputPath) return;

  let fullPath = path.join(process.cwd(), outputPath);
  if (!fs.existsSync(fullPath) || !interactive) {
    writeFile(cfg, fullPath);
    return;
  }

  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question(`\x1b[41mConfig file already exists. Overwrite (y/n)?\x1b[0m `, answer => {
    if (["yes", "y"].includes(answer.toLowerCase())) {
      writeFile(cfg, fullPath);
    } else {
      console.log("Skipping config creation");
    }
    readline.close();
  });
}

async function getConfig(templatePath) {
  console.log("Getting Config from SSM");
  let configTmpl;
  try {
    configTmpl = require(templatePath);
  } catch (e) {
    console.error("\x1b[31m\nERROR: Config template file not found\n\x1b[0m");
    console.error(e);
    process.exit(1);
  }

  try {
    let cfg = await config.get(configTmpl);
    console.log("\x1b[32m\nSuccessfully got SSM config\n\x1b[0m");
    return cfg;
  } catch (err) {
    console.error("\x1b[31m\nERROR: Failed Getting SSM config\n\x1b[0m");
    console.error(err);
    process.exit(1);
  }
}

function writeFile(cfg, fullPath) {
  console.log(`Writing to ${fullPath}`);
  try {
    fs.writeFileSync(fullPath, "module.exports =" + JSON.stringify(cfg, null, 2)); // { flag: "w" } => default. overwrites. { flag: "wx" } => don't overwrite
  } catch (err) {
    console.error("\x1b[31m\nERROR: Failed writing config file\n\x1b[0m");
    console.error(err);
    process.exit(1);
  }
}
