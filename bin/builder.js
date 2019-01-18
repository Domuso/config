#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const config = require("../index");

const DEFAULT_TEMPLATE_PATH = "./config.json";
const DEFAULT_OUTPUT_PATH = "./src/config.js";

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

const showWarning = !outputPath || !templatePath;

templatePath = path.join(process.cwd(), templatePath || DEFAULT_TEMPLATE_PATH);
outputPath = path.join(process.cwd(), outputPath || DEFAULT_OUTPUT_PATH);

if (showWarning) {
  console.warn(`\x1b[34mtemplatePath and OutputPath we're not passed. Using default values:\
    \n\nTemplatePath: ${templatePath}\n\nOutputPath: ${outputPath}\n\nenvironnement: ${
    process.env.NODE_ENV
  } \
    \n\nYou can also use the following format: \x1b[33mbuilder template=<path> output=<path>\x1b[0m\n`);
}

console.log("\x1b[32mSTARTING TO BUILD CONFIG FILE\x1b[0m\n");

if (fs.existsSync(outputPath) && interactive) {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question(`\x1b[41mConfig file already exists. Overwrite (y/n)?\x1b[0m `, answer => {
    if (["yes", "y"].includes(answer.toLowerCase())) {
      writeFile();
    } else {
      console.log("Skipping config creation");
    }
    readline.close();
  });
} else {
  writeFile();
}

function writeFile() {
  console.log("Getting Config from SSM");
  let configTmpl;
  try {
    configTmpl = require(templatePath);
  } catch (e) {
    console.error("\x1b[31m\nERROR: Config template file not found\n\x1b[0m");
    console.error(e);
    process.exit(1);
  }

  config
    .get(configTmpl)
    .catch(e => {
      console.error("\x1b[31m\nERROR: Failed Getting SSM config\n\x1b[0m");
      console.error(e);
      process.exit(1);
    })
    .then(cfg => {
      console.log("\x1b[32m\nSuccessfully got SSM config\n\x1b[0m");
      console.log(`Writing to ${outputPath}`);
      fs.writeFileSync(outputPath, "module.exports =" + JSON.stringify(cfg)); // { flag: "w" } => default. overwrites. { flag: "wx" } => don't overwrite
      console.log("\x1b[32m\nDone Building config\n\x1b[0m");
    })
    .catch(e => {
      console.error("\x1b[31m\nERROR: Failed writing config file\n\x1b[0m");
      console.error(e);
      process.exit(1);
    });
}
